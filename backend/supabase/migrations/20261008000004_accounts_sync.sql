-- Veridun migration 4 of 4: real accounts + cross-device sync (PR 10).
-- Applied on top of migrations 1-3. Safe to re-run (create or replace / if not exists).
--
--   1. Self-serve organizations for the staging project: any signed-in user
--      can create an organization and becomes its owner (max 3 per account).
--      Clinicians share with organizations that exist in the database.
--   2. share_grants carries the assignment context chosen by the clinician
--      (label + optional start/end) for shares that are not tied to a
--      published assignments row. Immutable after creation, like org_id.
--   3. get_share_assertions(): credentials nobody has verified yet come back
--      as PENDING_VERIFICATION instead of NOT_CURRENT, so an organization can
--      tell "not checked yet" from "expired / revoked". Never as VERIFIED.
--   4. Append-only event tables still reject DELETE and content changes, but
--      allow the foreign-key "set null" that Postgres performs when a user,
--      clinician, credential or grant is deleted. Without this, deleting an
--      account with any history failed.

-- ---------- 1. organizations ----------
create or replace function public.create_organization(p_name text, p_org_type text default null)
returns public.organizations
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_name text := btrim(coalesce(p_name, '')); v_slug text; v_org public.organizations;
begin
  if v_uid is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'organization name must be 2-120 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.organization_members m where m.user_id = v_uid and m.role = 'owner') >= 3 then
    raise exception 'staging limit: 3 organizations per account' using errcode = '54000';
  end if;
  v_slug := btrim(left(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), 40), '-');
  if v_slug = '' then v_slug := 'org'; end if;
  v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  insert into public.organizations (slug, name, org_type, is_demo)
    values (v_slug, v_name, nullif(btrim(coalesce(p_org_type, '')), ''), false) returning * into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org.id, v_uid, 'owner');
  insert into public.audit_events (event_type, actor_user_id, actor_type, org_id, result)
    values ('ORGANIZATION_CREATED', v_uid, 'ORGANIZATION', v_org.id, 'OWNER');
  return v_org;
end $$;
revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------- 2. assignment context on grants ----------
alter table public.share_grants
  add column if not exists assignment_label text check (assignment_label is null or length(assignment_label) <= 200),
  add column if not exists assignment_starts_on date,
  add column if not exists assignment_ends_on date;
do $$ begin
  alter table public.share_grants add constraint share_grants_assignment_window
    check (assignment_starts_on is null or assignment_ends_on is null or assignment_ends_on >= assignment_starts_on);
exception when duplicate_object then null; end $$;

create or replace function private.share_grants_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.clinician_id <> old.clinician_id or new.org_id <> old.org_id or new.token_hash <> old.token_hash
     or new.assignment_id is distinct from old.assignment_id or new.created_at <> old.created_at
     or new.assignment_label is distinct from old.assignment_label
     or new.assignment_starts_on is distinct from old.assignment_starts_on
     or new.assignment_ends_on is distinct from old.assignment_ends_on then
    raise exception 'share grant identity is immutable' using errcode = '42501';
  end if;
  if old.status = 'REVOKED' and new.status <> 'REVOKED' then
    raise exception 'a revoked grant cannot be reactivated; create a new share' using errcode = '42501';
  end if;
  if old.status = 'USED' and new.status <> 'USED' then
    raise exception 'a used one-time grant cannot be reactivated; create a new share' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- 3. share assertions: PENDING_VERIFICATION ----------
create or replace function public.get_share_assertions(p_grant uuid)
returns table (requirement_label text, label text, mode public.assertion_mode, status text,
               expires_on date, issuer text, jurisdiction_code text)
language plpgsql volatile security definer set search_path = '' as $$
declare g public.share_grants; v_outcome public.access_outcome; v_n int := 0; v_is_owner boolean;
begin
  select * into g from public.share_grants where id = p_grant;
  if not found then
    raise exception 'share not found' using errcode = 'P0002';
  end if;
  v_is_owner := private.owns_grant(p_grant);
  if not (v_is_owner or private.is_org_member(g.org_id)) then
    raise exception 'not authorized for this share' using errcode = '42501';
  end if;

  v_outcome := case
    when g.status = 'REVOKED' or g.revoked_at is not null then 'REFUSED_REVOKED'
    when g.duration = 'ONE_TIME' and g.used_at is not null then 'REFUSED_USED'
    when g.status = 'EXPIRED' or (g.expires_at is not null and g.expires_at <= now()) then 'REFUSED_EXPIRED'
    else 'GRANTED' end;

  if v_outcome = 'GRANTED' then
    return query
      select a.requirement_label,
             case when a.mode = 'REQUIREMENT_SATISFIED' then coalesce(a.requirement_label, k.short_label, k.label) else c.display_name end,
             a.mode,
             case when c.status = 'VERIFIED' and (c.expires_on is null or c.expires_on >= current_date)
                  then (case when a.mode = 'REQUIREMENT_SATISFIED' then 'REQUIREMENT_SATISFIED' else 'VERIFIED' end)
                  -- Submitted but no verifier has checked it yet: never presented as verified.
                  when c.status in ('UNVERIFIED','VERIFYING') and (c.expires_on is null or c.expires_on >= current_date)
                  then 'PENDING_VERIFICATION'
                  else 'NOT_CURRENT' end,
             case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.expires_on end,
             case when a.mode = 'REQUIREMENT_SATISFIED' then null else i.name end,
             case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.jurisdiction_code end
      from public.share_grant_assertions a
      join public.credentials c on c.id = a.credential_id
      join public.credential_catalog k on k.kind = c.kind
      left join public.issuers i on i.id = c.issuer_id
      where a.grant_id = p_grant
      order by a.requirement_label nulls last;
    get diagnostics v_n = row_count;
    if g.duration = 'ONE_TIME' and not v_is_owner then
      update public.share_grants set used_at = now(), status = 'USED' where id = p_grant;
    end if;
  end if;

  if not v_is_owner then
    insert into public.share_access_events (grant_id, org_id, actor_user_id, outcome, assertions_accessed)
      values (p_grant, g.org_id, auth.uid(), v_outcome, v_n);
    insert into public.audit_events (event_type, actor_user_id, actor_type, clinician_id, org_id, assignment_id, grant_id, result, detail)
      values (case when v_outcome = 'GRANTED' then 'SHARE_VIEWED' else 'SHARE_ACCESS_REFUSED' end,
              auth.uid(), 'ORGANIZATION', g.clinician_id, g.org_id, g.assignment_id, p_grant, v_outcome::text,
              jsonb_build_object('assertions_accessed', v_n));
  end if;
  return;
end $$;

-- ---------- 4. append-only, but account deletion works ----------
create or replace function private.forbid_mutation() returns trigger language plpgsql set search_path = '' as $$
declare k text; o jsonb; n jsonb;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      -- Only an FK column (…_id) being cleared by ON DELETE SET NULL is allowed.
      if (n -> k) is distinct from (o -> k) and not (k like '%\_id' and jsonb_typeof(n -> k) = 'null') then
        raise exception '% is append-only', tg_table_name using errcode = '42501';
      end if;
    end loop;
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
