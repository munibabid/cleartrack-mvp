-- PR 13: Verification Source Registry, verification levels, requirement
-- minimum levels with locked legal/issuer floors, policy traceability, and
-- a manual primary-source check recorded through the registry.
--
-- Honesty rules enforced here:
--   * a verification level is written ONLY by the security-definer RPCs
--     below (never by a direct client update, even a verifier's);
--   * a primary-source check must use an APPROVED registry source that
--     covers the credential kind (and, for a board, the same jurisdiction);
--   * an RN license can only reach PRIMARY_SOURCE_VERIFIED through a board
--     or Nursys; document review / self-attestation / AI extraction never do;
--   * CONTINUOUSLY_MONITORED needs an approved monitoring source (Nursys
--     e-Notify is PENDING until Veridun has institution API credentials);
--   * facility requirements cannot set a minimum level below a locked floor.

-- ---------- levels ----------
create or replace function private.level_rank(p_level text) returns int
language sql immutable set search_path = '' as $$
  select case p_level
    when 'CONTINUOUSLY_MONITORED' then 6
    when 'PRIMARY_SOURCE_VERIFIED' then 5
    when 'ISSUER_VERIFIED' then 4
    when 'EMPLOYER_VERIFIED' then 3
    when 'VENDOR_VERIFIED' then 3
    when 'DOCUMENT_REVIEWED' then 2
    when 'SELF_ATTESTED' then 1
    else 0 end
$$;
revoke all on function private.level_rank(text) from public;
grant execute on function private.level_rank(text) to authenticated;

-- ---------- registry ----------
alter table public.verification_sources
  add column if not exists slug text,
  add column if not exists source_type text,
  add column if not exists jurisdiction_code text references public.jurisdictions(code),
  add column if not exists covered_jurisdictions text[] not null default '{}',
  add column if not exists credential_kinds text[] not null default '{}',
  add column if not exists source_method text,
  add column if not exists grants_level text,
  add column if not exists api_available boolean not null default false,
  add column if not exists api_requirements text,
  add column if not exists status text not null default 'UNAPPROVED',
  add column if not exists monitoring boolean not null default false,
  add column if not exists nursys_participating boolean,
  add column if not exists as_of date;
alter table public.verification_sources
  add constraint verification_sources_slug_key unique (slug),
  add constraint verification_sources_type_chk check (source_type is null or source_type in ('LICENSING_BOARD','NURSYS','CERTIFYING_BODY','EMPLOYER','VENDOR','PLATFORM')),
  add constraint verification_sources_method_chk check (source_method is null or source_method in ('PRIMARY_SOURCE','PRIMARY_SOURCE_EQUIVALENT','ISSUER','EMPLOYER','VENDOR','DOCUMENT_REVIEW','SELF_ATTESTED','AI_EXTRACTION')),
  add constraint verification_sources_level_chk check (grants_level is null or private.level_rank(grants_level) > 0),
  add constraint verification_sources_status_chk check (status in ('APPROVED','PENDING','UNAPPROVED')),
  add constraint verification_sources_lookup_https check (lookup_url is null or lookup_url ~ '^https://'),
  -- uploads, self-attestation and AI extraction can never be primary source
  add constraint verification_sources_never_psv check (
    source_method is null
    or source_method not in ('DOCUMENT_REVIEW','SELF_ATTESTED','AI_EXTRACTION')
    or private.level_rank(grants_level) < private.level_rank('PRIMARY_SOURCE_VERIFIED')),
  add constraint verification_sources_ai_no_level check (source_method is distinct from 'AI_EXTRACTION' or grants_level is null);
comment on column public.verification_sources.method is 'Legacy (PR 1-12) enum. PR 13 uses source_method + grants_level.';

-- ---------- catalog floors ----------
alter table public.credential_catalog
  add column if not exists min_verification_level text,
  add column if not exists level_floor_locked boolean not null default false,
  add column if not exists level_basis text;
alter table public.credential_catalog
  add constraint credential_catalog_level_chk check (min_verification_level is null or private.level_rank(min_verification_level) > 0);

-- ---------- policy traceability ----------
alter table public.requirement_sets
  add column if not exists policy_code text,
  add column if not exists policy_version text,
  add column if not exists effective_on date,
  add column if not exists required_by text;
alter table public.requirements
  add column if not exists min_verification_level text,
  add column if not exists validity_rule text;
alter table public.requirements
  add constraint requirements_level_chk check (min_verification_level is null or private.level_rank(min_verification_level) > 0);

-- Facility layers may raise any level and relax unlocked defaults, but can
-- never go below a locked floor (RN license = primary source; certifications
-- = issuer). Platform templates are maintained by admins only.
create or replace function private.requirements_level_floor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_floor text;
  v_locked boolean;
  v_org uuid;
begin
  if new.min_verification_level is null then return new; end if;
  select owner_org_id into v_org from public.requirement_sets where id = new.requirement_set_id;
  if new.is_rn_authorization then
    v_floor := 'PRIMARY_SOURCE_VERIFIED'; v_locked := true;
  else
    select min_verification_level, level_floor_locked into v_floor, v_locked
    from public.credential_catalog where kind = new.kind;
  end if;
  if v_org is not null and coalesce(v_locked, false)
     and private.level_rank(new.min_verification_level) < private.level_rank(v_floor) then
    raise exception 'facility rules cannot lower the % floor for % (minimum %)',
      case when new.is_rn_authorization or new.kind like 'RN_LICENSE%' then 'legal' else 'issuer' end,
      coalesce(new.kind, 'RN authorization'), v_floor using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists requirements_level_floor on public.requirements;
create trigger requirements_level_floor before insert or update on public.requirements
  for each row execute function private.requirements_level_floor();

-- ---------- credential level + monitoring state ----------
alter table public.credentials
  add column if not exists verification_level text,
  add column if not exists monitoring_state text not null default 'NOT_ENROLLED',
  add column if not exists source_checked_at timestamptz;
alter table public.credentials
  add constraint credentials_level_chk check (verification_level is null or private.level_rank(verification_level) > 0),
  add constraint credentials_monitoring_chk check (monitoring_state in ('NOT_ENROLLED','MANUAL_RECHECK','ENROLLED')),
  add constraint credentials_level_needs_verified check (verification_level is null or status = 'VERIFIED');

alter table public.credential_verifications
  add column if not exists source_slug text,
  add column if not exists verification_level text,
  add column if not exists status_at_source text,
  add column if not exists source_expires_on date,
  add column if not exists monitoring_state text,
  add column if not exists verifier_label text,
  add column if not exists policy_ref text;
alter table public.credential_verifications
  add constraint credential_verifications_level_chk check (verification_level is null or private.level_rank(verification_level) > 0),
  add constraint credential_verifications_status_chk check (status_at_source is null or status_at_source in ('ACTIVE','INACTIVE','EXPIRED','SUSPENDED','REVOKED','PROBATION','NOT_FOUND'));

-- Direct inserts (even a verifier's) cannot claim a level: only the RPCs can.
create policy verifications_no_client_level on public.credential_verifications
  as restrictive for insert to authenticated
  with check (verification_level is null and status_at_source is null and source_slug is null);

-- SECURITY INVOKER on purpose: current_user is 'authenticated' for a direct
-- client update and the function owner inside the definer RPCs below.
create or replace function private.credentials_level_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and (new.verification_level is not null or new.monitoring_state <> 'NOT_ENROLLED' or new.source_checked_at is not null) then
      raise exception 'verification levels are set only by a recorded source check' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.verification_level is distinct from old.verification_level
        or new.monitoring_state is distinct from old.monitoring_state
        or new.source_checked_at is distinct from old.source_checked_at) then
      raise exception 'verification levels are set only by a recorded source check' using errcode = '42501';
    end if;
    -- a verifier changing status directly (outside the RPCs) drops any level
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.verification_level := null;
    end if;
  end if;
  -- only a VERIFIED credential carries a level
  if new.status is distinct from 'VERIFIED' then
    new.verification_level := null;
  end if;
  return new;
end $$;
revoke all on function private.credentials_level_guard() from public;
drop trigger if exists credentials_level_guard on public.credentials;
create trigger credentials_level_guard before insert or update on public.credentials
  for each row execute function private.credentials_level_guard();

-- ---------- record a check through the registry ----------
create or replace function public.record_source_check(
  p_credential uuid,
  p_source text,
  p_result text,
  p_status_at_source text,
  p_source_expires_on date,
  p_reference text,
  p_checked_on date,
  p_monitoring text default 'MANUAL_RECHECK'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.credentials%rowtype;
  s public.verification_sources%rowtype;
  v_level text;
  v_status public.verification_status;
  v_outcome public.verification_outcome;
  v_exp date;
  v_date text;
  v_salt text;
  v_commit text;
  v_id uuid;
  v_label text;
  v_license boolean;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.is_verifier() then
    raise exception 'only a verifier can record a verification' using errcode = '42501';
  end if;
  if not private.privileged_mfa_ok() then
    raise exception 'verifiers must sign in with an authenticator app before recording a verification' using errcode = '42501';
  end if;
  if p_result not in ('VERIFIED','FAILED') then
    raise exception 'result must be VERIFIED or FAILED' using errcode = '22023';
  end if;
  if p_status_at_source is null or p_status_at_source not in ('ACTIVE','INACTIVE','EXPIRED','SUSPENDED','REVOKED','PROBATION','NOT_FOUND') then
    raise exception 'choose what the source said about the status' using errcode = '22023';
  end if;
  if p_result = 'VERIFIED' and p_status_at_source <> 'ACTIVE' then
    raise exception 'a credential is verified only when the source shows it ACTIVE; record FAILED instead' using errcode = '22023';
  end if;
  if p_result = 'FAILED' and p_status_at_source = 'ACTIVE' then
    raise exception 'the source showed ACTIVE: record VERIFIED, or pick the status the source showed' using errcode = '22023';
  end if;
  if coalesce(p_monitoring, '') not in ('NOT_ENROLLED','MANUAL_RECHECK','ENROLLED') then
    raise exception 'unknown monitoring state' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reference, '')), '') is null or char_length(p_reference) > 120 then
    raise exception 'enter the reference or confirmation number from the source lookup' using errcode = '22023';
  end if;
  if p_checked_on is null or p_checked_on > (now() at time zone 'UTC')::date then
    raise exception 'the check date cannot be in the future' using errcode = '22023';
  end if;
  select * into c from public.credentials where id = p_credential;
  if not found then
    raise exception 'credential not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.clinicians k where k.id = c.clinician_id and k.user_id = auth.uid()) then
    raise exception 'you cannot verify your own credential' using errcode = '42501';
  end if;
  select * into s from public.verification_sources where slug = p_source;
  if not found then
    raise exception 'source is not in the Verification Source Registry' using errcode = '22023';
  end if;
  if s.status <> 'APPROVED' then
    raise exception '% is not an approved verification source (%)', s.name, s.status using errcode = '42501';
  end if;
  if not (c.kind = any(s.credential_kinds)) then
    raise exception '% does not cover this credential type', s.name using errcode = '22023';
  end if;
  v_license := c.kind in ('RN_LICENSE','RN_LICENSE_MULTISTATE');
  if s.source_type = 'LICENSING_BOARD' and s.jurisdiction_code is distinct from c.jurisdiction_code then
    raise exception '% only confirms licenses it issued (%), not %', s.name, s.jurisdiction_code, coalesce(c.jurisdiction_code, 'no state') using errcode = '22023';
  end if;
  if cardinality(s.covered_jurisdictions) > 0 and v_license and not (c.jurisdiction_code = any(s.covered_jurisdictions)) then
    raise exception '% does not carry data for %', s.name, coalesce(c.jurisdiction_code, 'this state') using errcode = '22023';
  end if;
  v_level := s.grants_level;
  if v_level is null then
    raise exception '% gives no verification level', s.name using errcode = '22023';
  end if;
  if v_license and v_level <> 'PRIMARY_SOURCE_VERIFIED' then
    raise exception 'an RN license can only be verified with the board or Nursys' using errcode = '22023';
  end if;
  if p_monitoring = 'ENROLLED' then
    if not (s.monitoring and s.status = 'APPROVED') then
      raise exception '% does not provide continuous monitoring', s.name using errcode = '22023';
    end if;
  end if;
  if p_result = 'VERIFIED' and v_license and p_source_expires_on is null then
    raise exception 'enter the expiration date the source shows' using errcode = '22023';
  end if;
  if p_result = 'VERIFIED' and p_source_expires_on is not null and p_source_expires_on < p_checked_on then
    raise exception 'the source expiration is before the check date: the credential is expired' using errcode = '22023';
  end if;

  v_exp := coalesce(p_source_expires_on, c.expires_on);
  v_date := to_char(p_checked_on, 'YYYY-MM-DD');
  v_status := case
    when p_result = 'VERIFIED' then 'VERIFIED'
    when p_status_at_source in ('REVOKED','SUSPENDED') then 'REVOKED'
    when p_status_at_source = 'EXPIRED' then 'EXPIRED'
    else 'REJECTED' end::public.verification_status;
  v_outcome := case when p_result = 'VERIFIED' then 'SUCCEEDED' else 'FAILED' end::public.verification_outcome;
  if p_result = 'VERIFIED' and p_monitoring = 'ENROLLED' and v_level = 'PRIMARY_SOURCE_VERIFIED' then
    v_level := 'CONTINUOUSLY_MONITORED';
  end if;
  select coalesce(nullif(u.display_name, ''), 'Veridun verifier') into v_label from public.users u where u.id = auth.uid();

  update public.credentials set
    status = v_status,
    verified_at = case when p_result = 'VERIFIED' then (p_checked_on::timestamp at time zone 'UTC') else verified_at end,
    expires_on = v_exp,
    verification_level = case when p_result = 'VERIFIED' then v_level else null end,
    monitoring_state = case when p_result = 'VERIFIED' then p_monitoring else 'NOT_ENROLLED' end,
    source_checked_at = now(),
    last_monitored_at = now(),
    updated_at = now()
  where id = c.id;

  insert into public.credential_verifications (
    credential_id, source_id, verifier_user_id, method, outcome, completed_at, manual_intervention,
    source_name, source_slug, reference_code, checked_on, verification_level, status_at_source,
    source_expires_on, monitoring_state, verifier_label, policy_ref, notes
  ) values (
    c.id, s.id, auth.uid(),
    case when s.source_method = 'EMPLOYER' then 'EMPLOYER_ATTESTATION' when s.source_method = 'SELF_ATTESTED' then 'CLINICIAN_ATTESTATION' else 'MANUAL_DOCUMENT_REVIEW' end::public.verification_method,
    v_outcome, now(), true,
    s.name, s.slug, btrim(p_reference), p_checked_on,
    case when p_result = 'VERIFIED' then v_level else null end,
    p_status_at_source, p_source_expires_on, p_monitoring, v_label,
    'Verification Source Registry ' || coalesce(s.as_of::text, '') || ' · ' || s.slug || ' (' || s.status || ', ' || s.source_method || ')',
    'Manual check of the registry source''s official lookup by a verifier with authenticator 2FA. The reference stays off-chain.'
  ) returning id into v_id;

  v_salt := encode(extensions.gen_random_bytes(32), 'hex');
  v_commit := private.sha256_hex(private.verification_canonical(c.id, c.kind, c.clinician_id, p_result, s.name, v_date, coalesce(v_exp::text, ''), v_salt));
  insert into public.verification_anchors (verification_id, credential_id, commitment, salt, memo_type)
  values (v_id, c.id, v_commit, v_salt, 'veridun.verification-anchor.v1');

  insert into public.audit_events (event_type, actor_user_id, actor_type, clinician_id, credential_id, result, detail)
  values (
    case when p_result = 'VERIFIED' then 'VERIFICATION_SUCCEEDED' else 'VERIFICATION_FAILED' end,
    auth.uid(), 'VERIFIER', c.clinician_id, c.id, p_result,
    jsonb_build_object('source', s.name, 'source_slug', s.slug, 'level', case when p_result = 'VERIFIED' then v_level end,
      'status_at_source', p_status_at_source, 'checked_on', v_date, 'monitoring', p_monitoring, 'anchor', 'pending')
  );
  return jsonb_build_object(
    'verification_id', v_id, 'credential_id', c.id, 'commitment', v_commit,
    'memo_type', 'veridun.verification-anchor.v1', 'network', 'XRPL_TESTNET',
    'result', p_result, 'checked_on', v_date, 'level', case when p_result = 'VERIFIED' then v_level end,
    'source_name', s.name, 'status_at_source', p_status_at_source, 'expires_on', v_exp
  );
end $$;
revoke all on function public.record_source_check(uuid, text, text, text, date, text, date, text) from public, anon;
grant execute on function public.record_source_check(uuid, text, text, text, date, text, date, text) to authenticated;

-- ---------- PR 12 free-text route: now also records an honest level ----------
-- A source name that matches an approved registry source covering the kind
-- gets that source's level (never primary source for a license unless the
-- source is a board/Nursys covering that state). Anything else counts only
-- as Document Reviewed.
create or replace function private.level_for_named_source(p_kind text, p_jur text, p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.grants_level from public.verification_sources s
    where s.status = 'APPROVED' and lower(s.name) = lower(btrim(p_name))
      and p_kind = any(s.credential_kinds)
      and (s.source_type <> 'LICENSING_BOARD' or s.jurisdiction_code = p_jur)
      and (cardinality(s.covered_jurisdictions) = 0 or p_jur is null or p_jur = any(s.covered_jurisdictions))
      and s.grants_level is not null
    order by private.level_rank(s.grants_level) desc limit 1), 'DOCUMENT_REVIEWED')
$$;
revoke all on function private.level_for_named_source(text, text, text) from public;

create or replace function private.verifications_set_level() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.credentials%rowtype;
begin
  -- Only the PR 12 RPC path (no source_slug, outcome SUCCEEDED, source named).
  if new.source_slug is not null or new.outcome <> 'SUCCEEDED' or new.source_name is null then
    return new;
  end if;
  select * into c from public.credentials where id = new.credential_id;
  if not found or c.status <> 'VERIFIED' then return new; end if;
  new.verification_level := private.level_for_named_source(c.kind, c.jurisdiction_code, new.source_name);
  update public.credentials set verification_level = new.verification_level where id = c.id;
  return new;
end $$;
revoke all on function private.verifications_set_level() from public;
drop trigger if exists verifications_set_level on public.credential_verifications;
create trigger verifications_set_level before insert on public.credential_verifications
  for each row execute function private.verifications_set_level();

-- ---------- share assertions carry the verification level + source ----------
-- An organization viewing a real share sees "Primary Source Verified · Source:
-- California BRN · checked <date>" instead of a bare VERIFIED. The level is
-- returned only while the item is currently VERIFIED. For REQUIREMENT_SATISFIED
-- (private) items the level is returned but the source name and date are not,
-- so a private record's vendor is not disclosed. New columns are appended last;
-- access_share_by_token() is recreated to match.
drop function if exists public.access_share_by_token(text);
drop function if exists public.get_share_assertions(uuid);
create function public.get_share_assertions(p_grant uuid)
returns table (requirement_label text, label text, mode public.assertion_mode, status text,
               expires_on date, issuer text, jurisdiction_code text, kind text,
               verification_level text, verification_source text, source_checked_on date)
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
      select x.requirement_label, x.label, x.mode, x.status, x.expires_on, x.issuer, x.jurisdiction_code, x.kind,
             case when x.status in ('VERIFIED','REQUIREMENT_SATISFIED') then x.lvl end,
             case when x.status = 'VERIFIED' and x.mode <> 'REQUIREMENT_SATISFIED' then x.src end,
             case when x.status = 'VERIFIED' and x.mode <> 'REQUIREMENT_SATISFIED' then x.chk end
      from (
        select a.requirement_label,
               case when a.mode = 'REQUIREMENT_SATISFIED' then coalesce(a.requirement_label, k.short_label, k.label) else c.display_name end as label,
               a.mode,
               case when c.status = 'VERIFIED' and (c.expires_on is null or c.expires_on >= current_date)
                    then (case when a.mode = 'REQUIREMENT_SATISFIED' then 'REQUIREMENT_SATISFIED' else 'VERIFIED' end)
                    when c.status in ('UNVERIFIED','VERIFYING') and (c.expires_on is null or c.expires_on >= current_date)
                    then 'PENDING_VERIFICATION'
                    else 'NOT_CURRENT' end as status,
               case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.expires_on end as expires_on,
               case when a.mode = 'REQUIREMENT_SATISFIED' then null else i.name end as issuer,
               case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.jurisdiction_code end as jurisdiction_code,
               case when a.mode = 'REQUIREMENT_SATISFIED' then null else c.kind end as kind,
               c.verification_level as lvl, v.source_name as src, v.checked_on as chk
        from public.share_grant_assertions a
        join public.credentials c on c.id = a.credential_id
        join public.credential_catalog k on k.kind = c.kind
        left join public.issuers i on i.id = c.issuer_id
        left join lateral (
          select cv.source_name, cv.checked_on from public.credential_verifications cv
          where cv.credential_id = c.id and cv.outcome = 'SUCCEEDED'
          order by cv.completed_at desc, cv.id limit 1
        ) v on true
        where a.grant_id = p_grant
      ) x
      order by x.requirement_label nulls last;
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
               expires_on date, issuer text, jurisdiction_code text, kind text,
               verification_level text, verification_source text, source_checked_on date)
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
