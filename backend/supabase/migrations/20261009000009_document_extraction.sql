-- PR 14: on-device document extraction — accuracy tracking.
--
-- Documents are read in the browser (pdf.js / Tesseract.js / jsQR). This table
-- stores ONLY measurements of that reading: which fields were expected,
-- found, corrected by the nurse, or confirmed/contradicted by a verifier at
-- the source, with per-field confidence numbers and timings. It never stores
-- document text, field VALUES, names, codes or dates: the check below rejects
-- any confidence key that is not a known field name and any value that is not
-- a number between 0 and 1.
--
-- The verification_sources rows for the new issuers (APEX NIHSS, NIHSS+,
-- AAP NRP, ENA TNCC/ENPC, AWHONN, ANCC, …) come from the regenerated
-- seed/03_verification_registry.sql, applied right after this migration
-- (it is idempotent: ON CONFLICT (name) DO UPDATE).

create or replace function private.extraction_field_ok(f text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(x in ('holder_name','credential_id','course','issued_on','renew_by','expires_on',
                                 'training_center','jurisdiction','multistate','expired')), true)
  from unnest(coalesce(f, '{}'::text[])) as x;
$$;

create or replace function private.extraction_confidence_ok(c jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(coalesce(c, '{}'::jsonb)) = 'object'
     and coalesce((select bool_and(private.extraction_field_ok(array[k])
                                   and jsonb_typeof(v) = 'number'
                                   and (v #>> '{}')::numeric between 0 and 1)
                   from jsonb_each(coalesce(c, '{}'::jsonb)) as e(k, v)), true);
$$;

create table if not exists public.extraction_events (
  id               uuid primary key default gen_random_uuid(),
  event            text not null check (event in ('SCAN','CONFIRM','VERIFIER_CHECK')),
  credential_id    uuid references public.credentials(id) on delete set null,
  clinician_id     uuid references public.clinicians(id) on delete set null,
  actor_user_id    uuid default auth.uid() references public.users(id) on delete set null,
  kind             text not null check (kind ~ '^[A-Z][A-Z0-9_]*$'),
  profile          text not null check (profile in ('aha_resus','license','cert','record','dates_only')),
  method           text check (method in ('PDF_TEXT','PDF_OCR','IMAGE_OCR','UNSUPPORTED')),
  source_slug      text check (source_slug is null or source_slug ~ '^[a-z0-9-]{2,60}$'),
  fields_expected  text[] not null default '{}' check (private.extraction_field_ok(fields_expected)),
  fields_found     text[] not null default '{}' check (private.extraction_field_ok(fields_found)),
  fields_corrected text[] not null default '{}' check (private.extraction_field_ok(fields_corrected)),
  fields_confirmed text[] not null default '{}' check (private.extraction_field_ok(fields_confirmed)),
  mismatches       text[] not null default '{}' check (private.extraction_field_ok(mismatches)),
  confidence       jsonb not null default '{}' check (private.extraction_confidence_ok(confidence)),
  qr_found         boolean,
  rotated          smallint check (rotated is null or rotated in (0, 90, 180, 270)),
  scan_ms          integer check (scan_ms is null or scan_ms between 0 and 600000),
  confirm_ms       integer check (confirm_ms is null or confirm_ms between 0 and 86400000),
  created_at       timestamptz not null default now()
);
create index if not exists extraction_events_kind_idx on public.extraction_events (kind, created_at desc);
create index if not exists extraction_events_cred_idx on public.extraction_events (credential_id);
create index if not exists extraction_events_clin_idx on public.extraction_events (clinician_id);

alter table public.extraction_events enable row level security;

-- Nurse: SCAN / CONFIRM rows for their own credentials (or with no credential
-- yet, e.g. a scan before saving), always as themselves.
drop policy if exists extraction_owner_insert on public.extraction_events;
create policy extraction_owner_insert on public.extraction_events for insert to authenticated
  with check (actor_user_id = auth.uid()
              and event in ('SCAN','CONFIRM')
              and clinician_id = private.my_clinician_id()
              and (credential_id is null or private.owns_credential(credential_id)));
-- Verifier (with a verified authenticator at aal2): VERIFIER_CHECK rows.
drop policy if exists extraction_verifier_insert on public.extraction_events;
create policy extraction_verifier_insert on public.extraction_events for insert to authenticated
  with check (actor_user_id = auth.uid()
              and event = 'VERIFIER_CHECK'
              and private.is_verifier()
              and private.privileged_mfa_ok());
drop policy if exists extraction_read on public.extraction_events;
create policy extraction_read on public.extraction_events for select to authenticated
  using (clinician_id = private.my_clinician_id() or private.is_verifier() or private.is_admin());
-- Step-up, same as credentials: once a factor exists, aal2 is needed.
drop policy if exists extraction_mfa_read on public.extraction_events;
create policy extraction_mfa_read on public.extraction_events
  as restrictive for select to authenticated using (private.mfa_satisfied());
drop policy if exists extraction_mfa_insert on public.extraction_events;
create policy extraction_mfa_insert on public.extraction_events
  as restrictive for insert to authenticated with check (private.mfa_satisfied());

-- Append-only (FK columns may still be nulled by ON DELETE SET NULL).
drop trigger if exists extraction_events_append_only on public.extraction_events;
create trigger extraction_events_append_only before update or delete on public.extraction_events
  for each row execute function private.forbid_mutation();
revoke all on public.extraction_events from anon;
revoke update, delete, truncate, references, trigger on public.extraction_events from authenticated;
grant select, insert on public.extraction_events to authenticated;
revoke all on function private.extraction_field_ok(text[]) from public;
revoke all on function private.extraction_confidence_ok(jsonb) from public;
-- The CHECK constraints run as the inserting role, so authenticated needs execute.
grant execute on function private.extraction_field_ok(text[]) to authenticated;
grant execute on function private.extraction_confidence_ok(jsonb) to authenticated;
