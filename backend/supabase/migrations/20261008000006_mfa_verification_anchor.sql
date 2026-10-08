-- PR 12: authenticator-app (TOTP) step-up, verifier-recorded issuer checks,
-- and an XRPL commitment of each verification (no personal data on-chain).
--
-- Signing keys are NOT in this file. The staging demo anchors from a
-- per-verifier Testnet wallet that exists only in that browser session.
-- Production should anchor from a server-held key (see the Edge Function
-- in backend/supabase/functions/anchor-verification and docs/BACKEND.md).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- MFA helpers ----------
-- True when this session has a verified authenticator (TOTP) factor.
-- Reads auth.mfa_factors as the function owner (the API role cannot).
create or replace function private.user_has_verified_totp() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = auth.uid()
      and f.status::text = 'verified'
      and f.factor_type::text = 'totp'
  );
$$;

-- Enrolled users must present the authenticator code (JWT aal = aal2).
-- Users who have not enrolled keep working at aal1.
create or replace function private.mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
  select (not private.user_has_verified_totp())
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Verifier actions and org-admin membership changes require a verified
-- factor AND aal2. Checking "has a factor" here means a verifier who has
-- not enrolled yet cannot record a result.
create or replace function private.privileged_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.user_has_verified_totp()
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function private.is_any_org_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','admin')
  );
$$;

revoke all on function private.user_has_verified_totp() from public;
revoke all on function private.mfa_satisfied() from public;
revoke all on function private.privileged_mfa_ok() from public;
revoke all on function private.is_any_org_admin() from public;
grant execute on function private.user_has_verified_totp() to authenticated;
grant execute on function private.mfa_satisfied() to authenticated;
grant execute on function private.privileged_mfa_ok() to authenticated;
grant execute on function private.is_any_org_admin() to authenticated;

-- ---------- step-up on the sensitive actions ----------
-- Creating/extending shares, reading credentials, and opening documents
-- require aal2 once the user has a verified factor. RESTRICTIVE policies
-- AND with the existing owner/verifier policies.
create policy credentials_mfa_read on public.credentials
  as restrictive for select to authenticated
  using (private.mfa_satisfied());
create policy credentials_mfa_insert on public.credentials
  as restrictive for insert to authenticated
  with check (private.mfa_satisfied());
create policy credentials_mfa_update on public.credentials
  as restrictive for update to authenticated
  using (private.mfa_satisfied()) with check (private.mfa_satisfied());
create policy credentials_mfa_delete on public.credentials
  as restrictive for delete to authenticated
  using (private.mfa_satisfied());

create policy share_grants_mfa_insert on public.share_grants
  as restrictive for insert to authenticated
  with check (private.mfa_satisfied());
create policy share_grants_mfa_update on public.share_grants
  as restrictive for update to authenticated
  using (private.mfa_satisfied()) with check (private.mfa_satisfied());
create policy share_assertions_mfa_insert on public.share_grant_assertions
  as restrictive for insert to authenticated
  with check (private.mfa_satisfied());

-- Documents: the signed-URL API reads storage.objects, so this is what
-- "opening a document" checks. Other buckets are unaffected.
create policy source_docs_mfa on storage.objects
  as restrictive for all to authenticated
  using (bucket_id is distinct from 'source-documents' or private.mfa_satisfied())
  with check (bucket_id is distinct from 'source-documents' or private.mfa_satisfied());

-- Org owners/admins must have authenticator 2FA before they add, change,
-- or remove members. Reading memberships stays as it was. The first
-- membership is written by create_organization() (security definer).
create policy org_admin_mfa_insert on public.organization_members
  as restrictive for insert to authenticated
  with check (not private.is_any_org_admin() or private.privileged_mfa_ok());
create policy org_admin_mfa_update on public.organization_members
  as restrictive for update to authenticated
  using (not private.is_any_org_admin() or private.privileged_mfa_ok())
  with check (not private.is_any_org_admin() or private.privileged_mfa_ok());
create policy org_admin_mfa_delete on public.organization_members
  as restrictive for delete to authenticated
  using (not private.is_any_org_admin() or private.privileged_mfa_ok());

-- A verifier's recorded check also requires authenticator 2FA.
create policy verifications_mfa_insert on public.credential_verifications
  as restrictive for insert to authenticated
  with check (private.privileged_mfa_ok());

-- ---------- no self-verification; verifiers need 2FA to change status ----------
create or replace function private.credentials_status_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  status_change boolean;
begin
  status_change := tg_op = 'UPDATE' and (
       new.status is distinct from old.status
    or new.verified_at is distinct from old.verified_at
    or new.last_monitored_at is distinct from old.last_monitored_at);
  if auth.uid() is not null and exists (
       select 1 from public.clinicians k
       where k.id = new.clinician_id and k.user_id = auth.uid()
     ) and (
       (tg_op = 'INSERT' and (new.status not in ('UNVERIFIED','VERIFYING') or new.verified_at is not null))
       or status_change
     ) then
    raise exception 'you cannot verify your own credential' using errcode = '42501';
  end if;
  if auth.uid() is not null and private.is_verifier() and status_change and not private.privileged_mfa_ok() then
    raise exception 'verifiers must sign in with an authenticator app before changing verification state' using errcode = '42501';
  end if;
  if auth.uid() is null or private.is_verifier() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('UNVERIFIED','VERIFYING') or new.verified_at is not null then
      raise exception 'new credentials start unverified' using errcode = '42501';
    end if;
  elsif status_change or new.clinician_id <> old.clinician_id then
    raise exception 'only a verifier can change verification state' using errcode = '42501';
  elsif old.status = 'VERIFIED' and (new.kind <> old.kind or new.type_code <> old.type_code
        or new.jurisdiction_code is distinct from old.jurisdiction_code or new.expires_on is distinct from old.expires_on
        or new.issuer_id is distinct from old.issuer_id or new.metadata <> old.metadata) then
    raise exception 'verified facts are locked; submit a renewal instead' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- issuer-check record ----------
alter table public.credential_verifications
  add column if not exists source_name text,
  add column if not exists reference_code text,
  add column if not exists checked_on date;

alter table public.verification_sources
  add column if not exists lookup_url text;

comment on column public.credential_verifications.reference_code is
  'Issuer confirmation / eCard / license reference. Never copied into an XRPL memo.';

-- Canonical commitment. The salt stays in the database. Only the SHA-256
-- of this text is written on-ledger. No names, emails, license numbers,
-- or reference codes are part of the string.
create or replace function private.verification_canonical(
  p_credential uuid, p_kind text, p_holder uuid, p_result text, p_source text,
  p_verified_on text, p_expiration text, p_salt text
) returns text
language sql immutable set search_path = '' as $$
  select concat_ws(E'\n',
    'veridun-verification-v1',
    'credential_id=' || p_credential::text,
    'kind=' || p_kind,
    'holder_id=' || p_holder::text,
    'result=' || p_result,
    'source=' || p_source,
    'verified_at=' || p_verified_on,
    'expiration=' || coalesce(p_expiration, ''),
    'salt=' || p_salt)
$$;

create or replace function private.sha256_hex(p_text text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(p_text, 'UTF8'), 'sha256'), 'hex')
$$;

revoke all on function private.verification_canonical(uuid,text,uuid,text,text,text,text,text) from public;
revoke all on function private.sha256_hex(text) from public;

create table public.verification_anchors (
  id               uuid primary key default gen_random_uuid(),
  verification_id  uuid not null unique references public.credential_verifications(id) on delete cascade,
  credential_id    uuid not null references public.credentials(id) on delete cascade,
  commitment       text not null check (commitment ~ '^[0-9a-f]{64}$'),
  salt             text not null check (salt ~ '^[0-9a-f]{64}$'),
  network          public.proof_network not null default 'XRPL_TESTNET',
  tx_hash          text check (tx_hash is null or tx_hash ~ '^[0-9A-Fa-f]{64}$'),
  ledger_index     bigint,
  anchor_address   text check (anchor_address is null or anchor_address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  memo_type        text not null default 'veridun.verification-anchor.v1',
  created_at       timestamptz not null default now(),
  anchored_at      timestamptz
);
create index on public.verification_anchors (credential_id);
alter table public.verification_anchors enable row level security;

-- The salt is on this row. Clinicians can read their own (it is their
-- record). Organizations cannot: this table has no org policy. A live
-- share discloses the salt only through share_anchor_disclosure().
create policy anchors_owner_read on public.verification_anchors for select to authenticated
  using (private.owns_credential(credential_id) and private.mfa_satisfied());
create policy anchors_verifier_read on public.verification_anchors for select to authenticated
  using (private.is_verifier() and private.mfa_satisfied());
revoke insert, update, delete on public.verification_anchors from anon, authenticated;

-- Record an issuer check. The caller must be a verifier, at aal2, with a
-- verified authenticator factor, and must not own the credential.
-- p_result is VERIFIED or FAILED. The reference code is stored and is
-- never part of the commitment.
create or replace function public.record_verification(
  p_credential uuid,
  p_result text,
  p_source_name text,
  p_reference text,
  p_checked_on date
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.credentials%rowtype;
  v_result text;
  v_source text;
  v_date text;
  v_exp text;
  v_salt text;
  v_canon text;
  v_commit text;
  v_id uuid;
  v_status public.verification_status;
  v_outcome public.verification_outcome;
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
  v_source := nullif(btrim(coalesce(p_source_name, '')), '');
  if v_source is null or char_length(v_source) > 200 then
    raise exception 'enter the verification source (the issuer lookup you used)' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'enter the reference or confirmation number from the issuer lookup' using errcode = '22023';
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
  v_result := p_result;
  v_date := to_char(p_checked_on, 'YYYY-MM-DD');
  v_exp := coalesce(c.expires_on::text, '');
  v_status := case when p_result = 'VERIFIED' then 'VERIFIED'::public.verification_status else 'REJECTED'::public.verification_status end;
  v_outcome := case when p_result = 'VERIFIED' then 'SUCCEEDED'::public.verification_outcome else 'FAILED'::public.verification_outcome end;
  update public.credentials set
    status = v_status,
    verified_at = case when p_result = 'VERIFIED' then (p_checked_on::timestamp at time zone 'UTC') else verified_at end,
    last_monitored_at = now(),
    updated_at = now()
  where id = c.id;
  insert into public.credential_verifications (
    credential_id, verifier_user_id, method, outcome, completed_at, manual_intervention,
    source_name, reference_code, checked_on, notes
  ) values (
    c.id, auth.uid(), 'MANUAL_DOCUMENT_REVIEW', v_outcome, now(), true,
    v_source, btrim(p_reference), p_checked_on,
    'Recorded after the verifier checked the issuer lookup. Reference is stored off-chain only.'
  ) returning id into v_id;
  v_salt := encode(extensions.gen_random_bytes(32), 'hex');
  v_canon := private.verification_canonical(c.id, c.kind, c.clinician_id, v_result, v_source, v_date, v_exp, v_salt);
  v_commit := private.sha256_hex(v_canon);
  insert into public.verification_anchors (verification_id, credential_id, commitment, salt, memo_type)
  values (v_id, c.id, v_commit, v_salt, 'veridun.verification-anchor.v1');
  insert into public.audit_events (event_type, actor_user_id, actor_type, clinician_id, credential_id, result, detail)
  values (
    case when p_result = 'VERIFIED' then 'VERIFICATION_SUCCEEDED' else 'VERIFICATION_FAILED' end,
    auth.uid(), 'VERIFIER', c.clinician_id, c.id, p_result,
    jsonb_build_object('source', v_source, 'checked_on', v_date, 'anchor', 'pending')
  );
  return jsonb_build_object(
    'verification_id', v_id,
    'credential_id', c.id,
    'commitment', v_commit,
    'memo_type', 'veridun.verification-anchor.v1',
    'network', 'XRPL_TESTNET',
    'result', v_result,
    'checked_on', v_date
  );
end $$;

-- Attach the ledger transaction the verifier's session wallet submitted.
-- The commitment is NOT taken from the client; only the tx coordinates are.
create or replace function public.attach_verification_anchor(
  p_verification uuid,
  p_tx_hash text,
  p_ledger bigint,
  p_address text,
  p_network text default 'XRPL_TESTNET'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.verification_anchors%rowtype;
  v_net public.proof_network;
begin
  if auth.uid() is null or not private.is_verifier() or not private.privileged_mfa_ok() then
    raise exception 'only a verifier signed in with an authenticator app can anchor a verification' using errcode = '42501';
  end if;
  if p_network not in ('XRPL_TESTNET','XRPL_DEVNET','XRPL_MAINNET') then
    raise exception 'unknown XRPL network' using errcode = '22023';
  end if;
  v_net := p_network::public.proof_network;
  if p_tx_hash !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'transaction hash must be 64 hex characters' using errcode = '22023';
  end if;
  if p_address !~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$' then
    raise exception 'anchor address is not an XRPL classic address' using errcode = '22023';
  end if;
  select * into a from public.verification_anchors where verification_id = p_verification;
  if not found then
    raise exception 'verification has no commitment yet' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.credential_verifications v
    where v.id = p_verification and v.verifier_user_id = auth.uid()
  ) then
    raise exception 'only the verifier who recorded this check can anchor it' using errcode = '42501';
  end if;
  update public.verification_anchors set
    tx_hash = upper(p_tx_hash),
    ledger_index = p_ledger,
    anchor_address = p_address,
    network = v_net,
    anchored_at = now()
  where id = a.id;
  return jsonb_build_object('verification_id', p_verification, 'tx_hash', upper(p_tx_hash), 'commitment', a.commitment, 'network', p_network);
end $$;

-- What a live share may recompute. Salt is disclosed only here, only for
-- SHAREABLE assertions, only while the grant is live. Reference codes,
-- names, and document paths are not returned.
create or replace function public.share_anchor_disclosure(p_grant uuid)
returns table (
  credential_id uuid,
  kind text,
  holder_id uuid,
  result text,
  source text,
  verified_at text,
  expiration text,
  salt text,
  commitment text,
  tx_hash text,
  ledger_index bigint,
  network text,
  anchor_address text,
  memo_type text
)
language plpgsql security definer set search_path = '' as $$
declare
  g public.share_grants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.mfa_satisfied() then
    raise exception 'enter your authenticator code first' using errcode = '42501';
  end if;
  select * into g from public.share_grants where id = p_grant;
  if not found or not private.is_org_member(g.org_id) or not private.grant_is_live(p_grant) then
    raise exception 'not authorized for this share' using errcode = '42501';
  end if;
  return query
  select c.id, c.kind, c.clinician_id,
    case c.status::text when 'VERIFIED' then 'VERIFIED' when 'REJECTED' then 'FAILED' else c.status::text end,
    v.source_name,
    to_char(v.checked_on, 'YYYY-MM-DD'),
    coalesce(c.expires_on::text, ''),
    an.salt, an.commitment, an.tx_hash, an.ledger_index, an.network::text, an.anchor_address, an.memo_type
  from public.share_grant_assertions s
  join public.credentials c on c.id = s.credential_id
  join public.verification_anchors an on an.credential_id = c.id
  join public.credential_verifications v on v.id = an.verification_id
  where s.grant_id = p_grant
    and s.mode = 'VERIFIED_CREDENTIAL'
    and an.tx_hash is not null;
end $$;

revoke all on function public.record_verification(uuid, text, text, text, date) from public, anon;
revoke all on function public.attach_verification_anchor(uuid, text, bigint, text, text) from public, anon;
revoke all on function public.share_anchor_disclosure(uuid) from public, anon;
grant execute on function public.record_verification(uuid, text, text, text, date) to authenticated;
grant execute on function public.attach_verification_anchor(uuid, text, bigint, text, text) to authenticated;
grant execute on function public.share_anchor_disclosure(uuid) to authenticated;

-- ---------- activity-log batch anchor (optional, same rules) ----------
-- A hash of the account's audit rows through a high-water id, plus a
-- private salt. New rows after that id do not break a past anchor.
create table public.audit_anchors (
  id              uuid primary key default gen_random_uuid(),
  clinician_id    uuid not null references public.clinicians(id) on delete cascade,
  through_event_id bigint not null,
  event_count     int not null,
  events_hash     text not null check (events_hash ~ '^[0-9a-f]{64}$'),
  salt            text not null check (salt ~ '^[0-9a-f]{64}$'),
  commitment      text not null check (commitment ~ '^[0-9a-f]{64}$'),
  network         public.proof_network not null default 'XRPL_TESTNET',
  tx_hash         text check (tx_hash is null or tx_hash ~ '^[0-9A-Fa-f]{64}$'),
  ledger_index    bigint,
  anchor_address  text,
  memo_type       text not null default 'veridun.activity-anchor.v1',
  created_at      timestamptz not null default now(),
  anchored_at     timestamptz
);
alter table public.audit_anchors enable row level security;
create policy audit_anchors_owner on public.audit_anchors for select to authenticated
  using (clinician_id = private.my_clinician_id() and private.mfa_satisfied());
create policy audit_anchors_verifier on public.audit_anchors for select to authenticated
  using (private.is_verifier() and private.mfa_satisfied());
revoke insert, update, delete on public.audit_anchors from anon, authenticated;

create or replace function private.activity_events_hash(p_clinician uuid, p_through bigint)
returns table (event_count int, events_hash text, through_event_id bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_body text;
  v_count int;
  v_max bigint;
begin
  select coalesce(string_agg(
           e.id::text || '|' || e.event_type || '|' || to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' || coalesce(e.result, ''),
           E'\n' order by e.id), ''),
         count(*)::int,
         coalesce(max(e.id), 0)
    into v_body, v_count, v_max
  from public.audit_events e
  where e.clinician_id = p_clinician and e.id <= p_through;
  event_count := v_count;
  events_hash := private.sha256_hex(v_body);
  through_event_id := v_max;
  return next;
end $$;
revoke all on function private.activity_events_hash(uuid, bigint) from public;

create or replace function public.prepare_activity_anchor()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_clin uuid;
  v_through bigint;
  h record;
  v_salt text;
  v_canon text;
  v_commit text;
  v_id uuid;
begin
  if auth.uid() is null or not private.mfa_satisfied() then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_clin := private.my_clinician_id();
  if v_clin is null then
    raise exception 'set up your profile first' using errcode = '42501';
  end if;
  select coalesce(max(id), 0) into v_through from public.audit_events where clinician_id = v_clin;
  if v_through = 0 then
    raise exception 'no activity to anchor yet' using errcode = '22023';
  end if;
  select * into h from private.activity_events_hash(v_clin, v_through);
  v_salt := encode(extensions.gen_random_bytes(32), 'hex');
  v_canon := concat_ws(E'\n',
    'veridun-activity-v1',
    'clinician_id=' || v_clin::text,
    'through_event_id=' || h.through_event_id::text,
    'event_count=' || h.event_count::text,
    'events_hash=' || h.events_hash,
    'salt=' || v_salt);
  v_commit := private.sha256_hex(v_canon);
  insert into public.audit_anchors (clinician_id, through_event_id, event_count, events_hash, salt, commitment)
  values (v_clin, h.through_event_id, h.event_count, h.events_hash, v_salt, v_commit)
  returning id into v_id;
  return jsonb_build_object(
    'anchor_id', v_id,
    'commitment', v_commit,
    'memo_type', 'veridun.activity-anchor.v1',
    'through_event_id', h.through_event_id,
    'event_count', h.event_count,
    'network', 'XRPL_TESTNET'
  );
end $$;

create or replace function public.attach_activity_anchor(
  p_anchor uuid, p_tx_hash text, p_ledger bigint, p_address text, p_network text default 'XRPL_TESTNET'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.audit_anchors%rowtype;
begin
  if auth.uid() is null or not private.mfa_satisfied() then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into a from public.audit_anchors where id = p_anchor and clinician_id = private.my_clinician_id();
  if not found then
    raise exception 'anchor not found' using errcode = 'P0002';
  end if;
  if p_tx_hash !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'transaction hash must be 64 hex characters' using errcode = '22023';
  end if;
  update public.audit_anchors set
    tx_hash = upper(p_tx_hash), ledger_index = p_ledger, anchor_address = p_address,
    network = p_network::public.proof_network, anchored_at = now()
  where id = a.id;
  return jsonb_build_object('anchor_id', a.id, 'tx_hash', upper(p_tx_hash), 'commitment', a.commitment);
end $$;

-- Recompute the events hash through the anchored high-water mark.
-- Returns match=false when a covered row was altered. Rows newer than
-- through_event_id are reported as not yet anchored.
create or replace function public.check_activity_anchor(p_anchor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.audit_anchors%rowtype;
  h record;
  v_canon text;
  v_commit text;
  v_newer int;
begin
  if auth.uid() is null or not private.mfa_satisfied() then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into a from public.audit_anchors
   where id = p_anchor and (clinician_id = private.my_clinician_id() or private.is_verifier());
  if not found then
    raise exception 'anchor not found' using errcode = 'P0002';
  end if;
  select * into h from private.activity_events_hash(a.clinician_id, a.through_event_id);
  v_canon := concat_ws(E'\n',
    'veridun-activity-v1',
    'clinician_id=' || a.clinician_id::text,
    'through_event_id=' || a.through_event_id::text,
    'event_count=' || h.event_count::text,
    'events_hash=' || h.events_hash,
    'salt=' || a.salt);
  v_commit := private.sha256_hex(v_canon);
  select count(*)::int into v_newer from public.audit_events
   where clinician_id = a.clinician_id and id > a.through_event_id;
  return jsonb_build_object(
    'match', v_commit = a.commitment and h.events_hash = a.events_hash and h.event_count = a.event_count,
    'commitment', a.commitment,
    'recomputed', v_commit,
    'tx_hash', a.tx_hash,
    'network', a.network,
    'memo_type', a.memo_type,
    'through_event_id', a.through_event_id,
    'newer_events', v_newer
  );
end $$;

revoke all on function public.prepare_activity_anchor() from public, anon;
revoke all on function public.attach_activity_anchor(uuid, text, bigint, text, text) from public, anon;
revoke all on function public.check_activity_anchor(uuid) from public, anon;
grant execute on function public.prepare_activity_anchor() to authenticated;
grant execute on function public.attach_activity_anchor(uuid, text, bigint, text, text) to authenticated;
grant execute on function public.check_activity_anchor(uuid) to authenticated;

-- Public lookup pages confirmed Oct 2026. Kinds with no confirmed public
-- lookup page are not given a made-up URL (the verifier still types the source).
insert into public.verification_sources (name, method, is_simulated, notes, lookup_url) values
  ('Nursys QuickConfirm', 'MANUAL_DOCUMENT_REVIEW', false,
   'Free public license and discipline lookup for participating US boards of nursing. Primary-source equivalent data from the boards. A hit here is the issuer check; XRPL only anchors that this record was stored.',
   'https://www.nursys.com/LQC/LQCTerms.aspx'),
  ('AHA eCard verification', 'MANUAL_DOCUMENT_REVIEW', false,
   'Employer verification of claimed AHA eCards (BLS, ACLS, PALS). Codes that contain letters are RQI cards and are checked at https://www.heart.org/RQIverify instead.',
   'https://ecards.heart.org/student/myecards?pid=ahaecard.employerStudentSearch'),
  ('American Red Cross digital certificate', 'MANUAL_DOCUMENT_REVIEW', false,
   'Find My Certificate accepts a certificate ID. hStream clinical certificates use https://redcross.healthstream.com/ and a 6-character ID.',
   'https://www.redcross.org/take-a-class/digital-certificate'),
  ('AACN certification verification', 'MANUAL_DOCUMENT_REVIEW', false,
   'AACN states this system may be used as primary source verification for AACN certifications (CCRN, PCCN, CMC, CSC).',
   'https://www.aacn.org/certification/verify-certification'),
  ('BCEN certification verification', 'MANUAL_DOCUMENT_REVIEW', false,
   'BCEN verification is requested by the credential holder (digital badge or a credential verification email). There is no open third-party search box. CEN, CPEN, TCRN, CFRN, CTRN.',
   'https://bcen.org/verify-certification/'),
  ('NCC primary source verification', 'MANUAL_DOCUMENT_REVIEW', false,
   'NCC verification requests (RNC-OB, RNC-MNN, RNC-NIC, RNC-LRN, C-EFM and other NCC credentials). The certificant starts the request.',
   'https://www.nccwebsite.org/verifications/request')
on conflict (name) do update set lookup_url = excluded.lookup_url, notes = excluded.notes, is_simulated = excluded.is_simulated;
