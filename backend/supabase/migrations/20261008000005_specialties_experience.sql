-- Veridun migration 5 of 5 (PR 11). Safe to re-run.
--
--   1. public.specialties: the shared RN specialty list (id, group, name,
--      short name, sort order). Reference data, readable by everyone,
--      writable only by an admin. RLS on.
--   2. clinicians.specialty and assignments.accepted_specialties are no
--      longer limited to ICU/ED/LD/MEDSURG: they must be known specialty ids.
--      clinicians.secondary_specialties holds up to 5 optional other
--      specialties. clinicians.preferences holds reminder/notification
--      settings (the app does not send notifications yet).
--   3. requirements.is_preferred (shown, never blocks readiness) and requirements.min_months: the minimum months of work in the specialty
--      within the recency window (default 12 of the last 24). Organizations
--      set it per requirement; the catalog default is only a fallback.
--   4. get_share_assertions() / access_share_by_token() also return kind, so an organization viewing a
--      share can apply compact (NLC) coverage rules to a license.

create table if not exists public.specialties (
  id         text primary key check (id ~ '^[A-Z][A-Z0-9_]*$'),
  grp        text not null,
  name       text not null,
  short_name text not null,
  sort_order int  not null,
  created_at timestamptz not null default now()
);
alter table public.specialties enable row level security;
do $$ begin
  create policy ref_read on public.specialties for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ref_admin on public.specialties for all to authenticated using (private.is_admin()) with check (private.is_admin());
exception when duplicate_object then null; end $$;
revoke all on public.specialties from public, anon, authenticated;
grant select on public.specialties to anon, authenticated;

alter table public.clinicians add column if not exists secondary_specialties text[] not null default '{}';
alter table public.clinicians add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.clinicians drop constraint if exists clinicians_specialty_check;
alter table public.clinicians drop constraint if exists clinicians_secondary_max;
alter table public.clinicians add constraint clinicians_secondary_max check (cardinality(secondary_specialties) <= 5);
alter table public.assignments drop constraint if exists assignments_accepted_specialties_check;
alter table public.assignments drop constraint if exists assignments_accepted_nonempty;
alter table public.assignments add constraint assignments_accepted_nonempty check (cardinality(accepted_specialties) > 0);

-- Specialty ids must exist in public.specialties (a CHECK can't query a table).
create or replace function private.validate_specialties() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bad text;
begin
  if tg_table_name = 'clinicians' then
    if not exists (select 1 from public.specialties s where s.id = new.specialty) then
      raise exception 'unknown specialty: %', new.specialty using errcode = '23514';
    end if;
    select x into v_bad from unnest(new.secondary_specialties) x
      where not exists (select 1 from public.specialties s where s.id = x) limit 1;
    if v_bad is not null then raise exception 'unknown specialty: %', v_bad using errcode = '23514'; end if;
    if new.specialty = any (new.secondary_specialties) then
      raise exception 'the primary specialty cannot also be a secondary specialty' using errcode = '23514';
    end if;
  else
    select x into v_bad from unnest(new.accepted_specialties) x
      where not exists (select 1 from public.specialties s where s.id = x) limit 1;
    if v_bad is not null then raise exception 'unknown specialty: %', v_bad using errcode = '23514'; end if;
  end if;
  return new;
end $$;
revoke execute on function private.validate_specialties() from public, anon, authenticated;
drop trigger if exists clinicians_specialties_valid on public.clinicians;
create trigger clinicians_specialties_valid before insert or update of specialty, secondary_specialties on public.clinicians
  for each row execute function private.validate_specialties();
drop trigger if exists assignments_specialties_valid on public.assignments;
create trigger assignments_specialties_valid before insert or update of accepted_specialties on public.assignments
  for each row execute function private.validate_specialties();

alter table public.requirements add column if not exists min_months int check (min_months > 0);
-- Preferred items are shown, never counted toward readiness.
alter table public.requirements add column if not exists is_preferred boolean not null default false;
alter table public.requirements drop constraint if exists requirements_min_within_window;
alter table public.requirements add constraint requirements_min_within_window
  check (min_months is null or recency_months is null or min_months <= recency_months);

-- kind is added as the last column; access_share_by_token() is recreated to match.
drop function if exists public.access_share_by_token(text);
drop function if exists public.get_share_assertions(uuid);
create function public.get_share_assertions(p_grant uuid)
returns table (requirement_label text, label text, mode public.assertion_mode, status text,
               expires_on date, issuer text, jurisdiction_code text, kind text)
language plpgsql volatile security definer set search_path = '' as $$
declare g public.share_grants; v_outcome public.access_outcome; v_n int := 0; v_is_owner boolean;
begin
  select * into g from public.share_grants where id = p_grant;
  if not found then raise exception 'share not found' using errcode = 'P0002'; end if;
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
                  when c.status in ('UNVERIFIED','VERIFYING') and (c.expires_on is null or c.expires_on >= current_date)
                  then 'PENDING_VERIFICATION'
                  else 'NOT_CURRENT' end,
             case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.expires_on end,
             case when a.mode = 'REQUIREMENT_SATISFIED' then null else i.name end,
             case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.jurisdiction_code end,
             case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.kind end
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
revoke execute on function public.get_share_assertions(uuid) from public, anon;
grant execute on function public.get_share_assertions(uuid) to authenticated;

create function public.access_share_by_token(p_token text)
returns table (requirement_label text, label text, mode public.assertion_mode, status text,
               expires_on date, issuer text, jurisdiction_code text, kind text)
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'invalid token' using errcode = '22023'; end if;
  select id into v_id from public.share_grants
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_id is null then raise exception 'share not found' using errcode = 'P0002'; end if;
  return query select * from public.get_share_assertions(v_id);
end $$;
revoke execute on function public.access_share_by_token(text) from public, anon;
grant execute on function public.access_share_by_token(text) to authenticated;
