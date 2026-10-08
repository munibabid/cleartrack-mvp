-- Veridun backend groundwork, migration 1 of 3: core schema.
-- Target: Supabase Postgres 15+ (auth.users, auth.uid(), storage schema).
-- Scope is RN-only and US-first. Nothing in this file contains real data.
--
-- Conventions
--   * Every table lives in "public" (exposed through PostgREST) and has RLS
--     enabled in migration 2. Helper functions live in "private" (not exposed).
--   * Credentials are owned by a clinician. Organizations never read the
--     credentials table directly: they only see *assertions* under a live
--     share grant (see migration 3, get_share_assertions()).
--   * Source documents live in the private "source-documents" storage
--     bucket. Rows store only the object path, never document contents.
--   * Event tables (audit_events, share_access_events, monitoring_events,
--     analytics_events) are append-only, enforced by trigger.

create schema if not exists private;

-- ---------- enums ----------
create type public.app_role as enum ('clinician','org_member','verifier','admin');
create type public.org_role as enum ('owner','admin','recruiter','viewer');
create type public.privacy_level as enum ('SHAREABLE','PRIVATE');
create type public.nlc_status as enum ('IMPLEMENTED','PARTIAL','PENDING');
create type public.verification_status as enum ('UNVERIFIED','VERIFYING','VERIFIED','REJECTED','REVOKED','EXPIRED');
create type public.verification_outcome as enum ('SUCCEEDED','FAILED','REJECTED_AFTER_REVIEW','APPROVED_AFTER_REVIEW');
create type public.verification_method as enum ('SIMULATED_PRIMARY_SOURCE','PRIMARY_SOURCE_API','MANUAL_DOCUMENT_REVIEW','EMPLOYER_ATTESTATION','CLINICIAN_ATTESTATION');
create type public.requirement_layer as enum ('STATE','WORK_TYPE','SPECIALTY','FACILITY');
create type public.override_action as enum ('ADD','WAIVE');
create type public.share_duration as enum ('ONE_TIME','H24','D7','D30','UNTIL_ASSIGNMENT_START','THROUGH_ASSIGNMENT_END','CUSTOM_DATE','UNTIL_REVOKED');
create type public.share_status as enum ('ACTIVE','EXPIRED','REVOKED','USED');
create type public.assertion_mode as enum ('VERIFIED_CREDENTIAL','REQUIREMENT_SATISFIED');
create type public.extension_status as enum ('PENDING','APPROVED','DECLINED');
create type public.access_outcome as enum ('GRANTED','REFUSED_EXPIRED','REFUSED_REVOKED','REFUSED_USED','REFUSED_NOT_FOUND');
create type public.monitoring_event_type as enum ('CHECKED','EXPIRED','REVOKED','REINSTATED','STATUS_CHANGED');
create type public.proof_network as enum ('XRPL_DEVNET','XRPL_TESTNET','XRPL_MAINNET');
create type public.proof_state as enum ('ISSUED','ACCEPTED','REVOKED');
create type public.assignment_status as enum ('DRAFT','PUBLISHED','CLOSED');

-- ---------- reference data ----------
create table public.jurisdictions (
  code        text primary key check (code ~ '^US-[A-Z]{2}$'),
  name        text not null,
  board_name  text not null,
  nlc_status  public.nlc_status,            -- null = not an NLC jurisdiction
  as_of       date not null
);

create table public.issuers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  kind              text not null check (kind in ('STATE_BOARD','CERT_BODY','EMPLOYER','OCC_HEALTH','SCREENING_VENDOR','SCHOOL','ATTESTATION','OTHER')),
  jurisdiction_code text references public.jurisdictions(code),
  unique nulls not distinct (name, jurisdiction_code)
);

create table public.credential_catalog (
  kind                 text primary key check (kind ~ '^[A-Z][A-Z0-9_]*$'),
  label                text not null,
  short_label          text,
  category             text not null,
  section              text not null,
  privacy              public.privacy_level not null,     -- decided by the catalog, never by the nurse
  jurisdiction_rule    text check (jurisdiction_rule in ('REQUIRED','NLC_HOME')),
  source               text,
  default_issuer       text,
  recency_months       int check (recency_months > 0),
  counts_for_readiness boolean not null default true,
  keywords             text
);

create table public.verification_sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  method       public.verification_method not null,
  issuer_id    uuid references public.issuers(id),
  is_simulated boolean not null default true,
  notes        text
);

-- ---------- people & organizations ----------
create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         public.app_role not null default 'clinician',  -- changed only by admins / service role
  created_at   timestamptz not null default now()
);

create table public.clinicians (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.users(id) on delete cascade,
  full_name         text not null,
  post_nominals     text,
  specialty         text not null check (specialty in ('ICU','ED','LD','MEDSURG')),
  home_jurisdiction text references public.jurisdictions(code),
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now()
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name       text not null,
  org_type   text,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       public.org_role not null default 'recruiter',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ---------- credentials ----------
create table public.credentials (
  id                    uuid primary key default gen_random_uuid(),
  clinician_id          uuid not null references public.clinicians(id) on delete cascade,
  kind                  text not null references public.credential_catalog(kind),
  type_code             text not null,                      -- e.g. RN_LICENSE:US-MA or CUSTOM_* (system-generated)
  display_name          text not null,
  jurisdiction_code     text references public.jurisdictions(code),
  issuer_id             uuid references public.issuers(id),
  status                public.verification_status not null default 'VERIFYING',
  expires_on            date,
  -- Non-sensitive structured facts only (e.g. {"years":3,"last_worked_on":"2026-09-17"}).
  -- PRIVATE kinds must keep this empty: no results, values or health detail.
  metadata              jsonb not null default '{}'::jsonb,
  source_document_path  text,                               -- object path in the private bucket; never contents
  renews_credential_id  uuid references public.credentials(id) on delete set null,
  verified_at           timestamptz,
  last_monitored_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (source_document_path is null or source_document_path !~ '^/' )
);
create index on public.credentials (clinician_id);
create index on public.credentials (kind);

create table public.credential_verifications (
  id                  uuid primary key default gen_random_uuid(),
  credential_id       uuid not null references public.credentials(id) on delete cascade,
  source_id           uuid references public.verification_sources(id),
  verifier_user_id    uuid references public.users(id),
  method              public.verification_method not null,
  outcome             public.verification_outcome not null,
  started_at          timestamptz,
  completed_at        timestamptz not null default now(),
  duration_ms         bigint check (duration_ms >= 0),
  manual_intervention boolean not null default false,
  notes               text
);
create index on public.credential_verifications (credential_id);

-- ---------- requirement sets (layers) ----------
-- A requirement set is one layer: STATE (RN authorization), WORK_TYPE base,
-- SPECIALTY module, or FACILITY overrides. owner_org_id null = platform template.
create table public.requirement_sets (
  id               uuid primary key default gen_random_uuid(),
  owner_org_id     uuid references public.organizations(id) on delete cascade,
  layer            public.requirement_layer not null,
  key              text not null,               -- TRAVEL_RN, ICU, US-MA, or a facility slug
  name             text not null,
  authority        text,                        -- "Required by: ..." text shown per requirement
  is_demo_template boolean not null default true,
  created_at       timestamptz not null default now(),
  unique nulls not distinct (owner_org_id, layer, key)
);

create table public.requirements (
  id                  uuid primary key default gen_random_uuid(),
  requirement_set_id  uuid not null references public.requirement_sets(id) on delete cascade,
  is_rn_authorization boolean not null default false,
  kind                text references public.credential_catalog(kind),
  jurisdiction_code   text references public.jurisdictions(code),
  action              public.override_action not null default 'ADD',
  recency_months      int check (recency_months > 0),
  note                text,
  check ( (is_rn_authorization and kind is null and jurisdiction_code is not null)
       or (not is_rn_authorization and kind is not null) )
);
create index on public.requirements (requirement_set_id);

-- ---------- assignments ----------
create table public.assignments (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  slug                 text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                 text not null,
  work_type            text not null check (work_type in ('TRAVEL_RN','STRIKE_RN','RAPID_RESPONSE_RN','PER_DIEM_RN')),
  jurisdiction_code    text not null references public.jurisdictions(code),
  facility_name        text,
  starts_on            date not null,
  ends_on              date not null,
  accepted_specialties text[] not null check (cardinality(accepted_specialties) > 0
                         and accepted_specialties <@ array['ICU','ED','LD','MEDSURG']),
  status               public.assignment_status not null default 'PUBLISHED',
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  check (ends_on > starts_on)
);
create index on public.assignments (org_id);

-- Layers that make up an assignment (state + work-type base + specialty
-- modules + facility overrides). The specialty module applied to a nurse is
-- the one matching that nurse's profile specialty, if accepted.
create table public.assignment_requirements (
  assignment_id      uuid not null references public.assignments(id) on delete cascade,
  requirement_set_id uuid not null references public.requirement_sets(id) on delete restrict,
  primary key (assignment_id, requirement_set_id)
);

-- ---------- sharing ----------
create table public.share_grants (
  id                uuid primary key default gen_random_uuid(),
  clinician_id      uuid not null references public.clinicians(id) on delete cascade,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  assignment_id     uuid references public.assignments(id) on delete set null,
  token_hash        text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),  -- sha256(token); the token itself is never stored
  duration          public.share_duration not null default 'THROUGH_ASSIGNMENT_END',
  custom_until      date,
  expires_at        timestamptz,           -- null only for UNTIL_REVOKED
  status            public.share_status not null default 'ACTIVE',
  used_at           timestamptz,
  revoked_at        timestamptz,
  expired_at        timestamptz,
  documents_shared  boolean not null default false check (documents_shared = false),
  created_at        timestamptz not null default now(),
  check ((duration = 'UNTIL_REVOKED') = (expires_at is null)),
  check (status <> 'REVOKED' or revoked_at is not null)
);
create index on public.share_grants (org_id);
create index on public.share_grants (clinician_id);

create table public.share_grant_assertions (
  grant_id          uuid not null references public.share_grants(id) on delete cascade,
  credential_id     uuid not null references public.credentials(id) on delete cascade,
  requirement_label text,
  mode              public.assertion_mode not null,
  primary key (grant_id, credential_id)
);

create table public.share_access_events (
  id                  bigint generated always as identity primary key,
  grant_id            uuid references public.share_grants(id) on delete set null,
  org_id              uuid references public.organizations(id) on delete set null,
  actor_user_id       uuid references public.users(id) on delete set null,
  outcome             public.access_outcome not null,
  assertions_accessed int not null default 0,
  occurred_at         timestamptz not null default now()
);
create index on public.share_access_events (grant_id);

create table public.extension_requests (
  id              uuid primary key default gen_random_uuid(),
  grant_id        uuid not null references public.share_grants(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  requested_by    uuid references public.users(id) on delete set null,
  requested_until date not null,
  reason          text,
  status          public.extension_status not null default 'PENDING',
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.users(id) on delete set null
);

-- ---------- monitoring, audit, proofs, analytics ----------
create table public.monitoring_events (
  id            bigint generated always as identity primary key,
  credential_id uuid references public.credentials(id) on delete set null,
  event_type    public.monitoring_event_type not null,
  source_id     uuid references public.verification_sources(id),
  actor_user_id uuid references public.users(id) on delete set null,
  detail        jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

create table public.audit_events (
  id            bigint generated always as identity primary key,
  event_type    text not null check (event_type ~ '^[A-Z][A-Z0-9_]*$'),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_type    text not null check (actor_type in ('CLINICIAN','ORGANIZATION','VERIFIER','SYSTEM')),
  clinician_id  uuid references public.clinicians(id) on delete set null,
  org_id        uuid references public.organizations(id) on delete set null,
  credential_id uuid references public.credentials(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  grant_id      uuid references public.share_grants(id) on delete set null,
  result        text,
  detail        jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);
create index on public.audit_events (clinician_id);
create index on public.audit_events (org_id);

create table public.proofs (
  id              uuid primary key default gen_random_uuid(),
  credential_id   uuid not null references public.credentials(id) on delete cascade,
  network         public.proof_network not null default 'XRPL_DEVNET',
  state           public.proof_state not null default 'ISSUED',
  issuer_address  text,
  subject_address text,
  create_tx       text,
  accept_tx       text,
  ledger_index    bigint,
  created_at      timestamptz not null default now()
);

create table public.analytics_events (
  id            bigint generated always as identity primary key,
  event_name    text not null check (event_name ~ '^[A-Z][A-Z0-9_]*$'),
  clinician_id  uuid references public.clinicians(id) on delete set null,
  org_id        uuid references public.organizations(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  properties    jsonb not null default '{}'::jsonb,   -- counts and durations only; no PII, no health detail
  occurred_at   timestamptz not null default now()
);

-- ---------- integrity triggers ----------
create or replace function private.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger credentials_touch before update on public.credentials
  for each row execute function private.touch_updated_at();

-- Append-only event tables: no UPDATE or DELETE, for anyone.
create or replace function private.forbid_mutation() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name using errcode = '42501'; end $$;
create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function private.forbid_mutation();
create trigger share_access_events_append_only before update or delete on public.share_access_events
  for each row execute function private.forbid_mutation();
create trigger monitoring_events_append_only before update or delete on public.monitoring_events
  for each row execute function private.forbid_mutation();
create trigger analytics_events_append_only before update or delete on public.analytics_events
  for each row execute function private.forbid_mutation();

-- PRIVATE kinds (health, screening, references) carry no structured detail,
-- and can never get an on-chain proof.
create or replace function private.credentials_privacy_guard() returns trigger language plpgsql as $$
declare p public.privacy_level;
begin
  select privacy into p from public.credential_catalog where kind = new.kind;
  if p = 'PRIVATE' and new.metadata <> '{}'::jsonb then
    raise exception 'PRIVATE credential kinds (%) cannot store structured detail', new.kind using errcode = '23514';
  end if;
  return new;
end $$;
create trigger credentials_privacy before insert or update on public.credentials
  for each row execute function private.credentials_privacy_guard();

create or replace function private.proofs_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.credentials c join public.credential_catalog k on k.kind = c.kind
             where c.id = new.credential_id and k.privacy = 'PRIVATE') then
    raise exception 'PRIVATE credentials are never issued on-chain' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger proofs_private_guard before insert or update on public.proofs
  for each row execute function private.proofs_guard();

-- Assertions for PRIVATE kinds are always "Requirement Satisfied" only.
create or replace function private.assertion_mode_guard() returns trigger language plpgsql as $$
begin
  if new.mode <> 'REQUIREMENT_SATISFIED' and exists (
     select 1 from public.credentials c join public.credential_catalog k on k.kind = c.kind
     where c.id = new.credential_id and k.privacy = 'PRIVATE') then
    raise exception 'PRIVATE credentials can only be shared as REQUIREMENT_SATISFIED' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger share_grant_assertions_mode before insert or update on public.share_grant_assertions
  for each row execute function private.assertion_mode_guard();
