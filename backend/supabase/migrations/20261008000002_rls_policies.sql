-- Veridun backend groundwork, migration 2 of 3: role helpers + row-level security.
--
-- Security model (see docs/BACKEND.md):
--   * Clinicians own their Passport: clinician row, credentials, share grants.
--   * Organizations never read credentials. They read share-grant metadata
--     for grants scoped to their org (so they can see ACTIVE / EXPIRED /
--     REVOKED status), and assertions only while the grant is live:
--     ACTIVE, not expired, not revoked, not a used one-time grant.
--   * Verifiers (users.role = 'verifier' or 'admin') act through their role.
--     Roles are assigned server-side only (never from the browser).
--   * Event tables are append-only (trigger in migration 1 + no UPDATE/DELETE grants).
--   * The browser only ever uses the anon key + a user JWT. The service key
--     bypasses RLS and must never ship to the browser.

-- ---------- helper functions (private schema, SECURITY DEFINER) ----------
create or replace function private.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u where u.id = auth.uid()
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.role = 'admin' from public.users u where u.id = auth.uid()), false)
$$;

create or replace function private.is_verifier() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.role in ('verifier','admin') from public.users u where u.id = auth.uid()), false)
$$;

create or replace function private.my_clinician_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.clinicians c where c.user_id = auth.uid()
$$;

create or replace function private.is_org_member(p_org uuid, p_writer boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_org and m.user_id = auth.uid()
                   and (not p_writer or m.role in ('owner','admin','recruiter')))
$$;

create or replace function private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m
                 where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner','admin'))
$$;

create or replace function private.owns_credential(p_credential uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.credentials c join public.clinicians k on k.id = c.clinician_id
                 where c.id = p_credential and k.user_id = auth.uid())
$$;

create or replace function private.owns_grant(p_grant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.share_grants g join public.clinicians k on k.id = g.clinician_id
                 where g.id = p_grant and k.user_id = auth.uid())
$$;

-- The single definition of a live grant (mirrors accessShare() in js/sharing.js).
create or replace function private.grant_is_live(p_grant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.share_grants g
                 where g.id = p_grant and g.status = 'ACTIVE' and g.revoked_at is null
                   and (g.expires_at is null or g.expires_at > now())
                   and not (g.duration = 'ONE_TIME' and g.used_at is not null))
$$;

create or replace function private.grant_org(p_grant uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.org_id from public.share_grants g where g.id = p_grant
$$;

-- Org members may see a clinician's name if that clinician ever shared with their org.
create or replace function private.clinician_shared_with_my_org(p_clinician uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.share_grants g join public.organization_members m on m.org_id = g.org_id
                 where g.clinician_id = p_clinician and m.user_id = auth.uid())
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------- new auth user -> public.users ----------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- integrity guards that depend on roles ----------
-- Only verifiers (or server-side code without a user JWT) may change
-- verification state. A nurse can never mark their own credential verified.
create or replace function private.credentials_status_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_verifier() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('UNVERIFIED','VERIFYING') or new.verified_at is not null then
      raise exception 'new credentials start unverified' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status or new.verified_at is distinct from old.verified_at
        or new.last_monitored_at is distinct from old.last_monitored_at or new.clinician_id <> old.clinician_id then
    raise exception 'only a verifier can change verification state' using errcode = '42501';
  elsif old.status = 'VERIFIED' and (new.kind <> old.kind or new.type_code <> old.type_code
        or new.jurisdiction_code is distinct from old.jurisdiction_code or new.expires_on is distinct from old.expires_on
        or new.issuer_id is distinct from old.issuer_id or new.metadata <> old.metadata) then
    raise exception 'verified facts are locked; submit a renewal instead' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger credentials_status before insert or update on public.credentials
  for each row execute function private.credentials_status_guard();

-- Grant identity is immutable; a clinician can revoke/extend, never re-target.
create or replace function private.share_grants_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.clinician_id <> old.clinician_id or new.org_id <> old.org_id or new.token_hash <> old.token_hash
     or new.assignment_id is distinct from old.assignment_id or new.created_at <> old.created_at then
    raise exception 'share grant identity is immutable' using errcode = '42501';
  end if;
  if old.status = 'REVOKED' and new.status <> 'REVOKED' then
    raise exception 'a revoked grant cannot be reactivated; create a new share' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger share_grants_immutable before update on public.share_grants
  for each row execute function private.share_grants_guard();

-- Assertions must reference the grant owner's own credentials.
create or replace function private.assertion_owner_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.share_grants g join public.credentials c on c.clinician_id = g.clinician_id
                 where g.id = new.grant_id and c.id = new.credential_id) then
    raise exception 'assertion credential does not belong to the grant owner' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger share_grant_assertions_owner before insert or update on public.share_grant_assertions
  for each row execute function private.assertion_owner_guard();

-- ---------- table privileges ----------
-- Supabase grants ALL on public tables to anon/authenticated by default; tighten.
revoke all on all tables in schema public from anon;
-- Supabase's default privileges also hand anon every sequence in public (identity columns); anon never inserts.
revoke all on all sequences in schema public from anon;
grant select on public.jurisdictions, public.issuers, public.credential_catalog, public.verification_sources to anon;
revoke update, delete, truncate on public.audit_events, public.share_access_events,
  public.monitoring_events, public.analytics_events from authenticated;
revoke insert on public.share_access_events from authenticated;   -- written only by get_share_assertions()
revoke update on public.users from authenticated;
grant update (display_name) on public.users to authenticated;     -- role is never self-assigned
revoke truncate on all tables in schema public from authenticated;

-- ---------- enable RLS everywhere ----------
do $$ declare t text; begin
  foreach t in array array['jurisdictions','issuers','credential_catalog','verification_sources','users','clinicians',
    'organizations','organization_members','credentials','credential_verifications','requirement_sets','requirements',
    'assignments','assignment_requirements','share_grants','share_grant_assertions','share_access_events',
    'extension_requests','monitoring_events','audit_events','proofs','analytics_events'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- reference data: readable by everyone, written by admins ----------
create policy ref_read on public.jurisdictions for select to anon, authenticated using (true);
create policy ref_admin on public.jurisdictions for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy ref_read on public.issuers for select to anon, authenticated using (true);
create policy ref_admin on public.issuers for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy ref_read on public.credential_catalog for select to anon, authenticated using (true);
create policy ref_admin on public.credential_catalog for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy ref_read on public.verification_sources for select to anon, authenticated using (true);
create policy ref_admin on public.verification_sources for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- ---------- users ----------
create policy users_self_read on public.users for select to authenticated
  using (id = auth.uid() or private.is_admin());
create policy users_self_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- clinicians ----------
create policy clinicians_owner on public.clinicians for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy clinicians_verifier_read on public.clinicians for select to authenticated
  using (private.is_verifier());
create policy clinicians_org_read on public.clinicians for select to authenticated
  using (private.clinician_shared_with_my_org(id));

-- ---------- organizations & members ----------
create policy orgs_read on public.organizations for select to authenticated using (true);
create policy orgs_admin_write on public.organizations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy orgs_platform_admin on public.organizations for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy members_read on public.organization_members for select to authenticated
  using (user_id = auth.uid() or private.is_org_member(org_id) or private.is_admin());
create policy members_manage on public.organization_members for all to authenticated
  using (private.is_org_admin(org_id) or private.is_admin())
  with check (private.is_org_admin(org_id) or private.is_admin());

-- ---------- credentials: owner + verifiers only (orgs use assertions) ----------
create policy credentials_owner on public.credentials for all to authenticated
  using (clinician_id = private.my_clinician_id())
  with check (clinician_id = private.my_clinician_id());
create policy credentials_verifier_read on public.credentials for select to authenticated
  using (private.is_verifier());
create policy credentials_verifier_update on public.credentials for update to authenticated
  using (private.is_verifier()) with check (private.is_verifier());

create policy verifications_read on public.credential_verifications for select to authenticated
  using (private.is_verifier() or private.owns_credential(credential_id));
create policy verifications_insert on public.credential_verifications for insert to authenticated
  with check (private.is_verifier() and verifier_user_id = auth.uid());

-- ---------- requirement sets & assignments ----------
create policy reqsets_read on public.requirement_sets for select to authenticated
  using (owner_org_id is null or private.is_org_member(owner_org_id)
         or exists (select 1 from public.assignment_requirements ar join public.assignments a on a.id = ar.assignment_id
                    where ar.requirement_set_id = requirement_sets.id and a.status = 'PUBLISHED'));
create policy reqsets_write on public.requirement_sets for all to authenticated
  using ((owner_org_id is not null and private.is_org_member(owner_org_id, true)) or private.is_admin())
  with check ((owner_org_id is not null and private.is_org_member(owner_org_id, true)) or private.is_admin());

create policy reqs_read on public.requirements for select to authenticated
  using (exists (select 1 from public.requirement_sets s where s.id = requirement_set_id));
create policy reqs_write on public.requirements for all to authenticated
  using (exists (select 1 from public.requirement_sets s where s.id = requirement_set_id
                 and ((s.owner_org_id is not null and private.is_org_member(s.owner_org_id, true)) or private.is_admin())))
  with check (exists (select 1 from public.requirement_sets s where s.id = requirement_set_id
                 and ((s.owner_org_id is not null and private.is_org_member(s.owner_org_id, true)) or private.is_admin())));

create policy assignments_read on public.assignments for select to authenticated
  using (status = 'PUBLISHED' or private.is_org_member(org_id));
create policy assignments_write on public.assignments for all to authenticated
  using (private.is_org_member(org_id, true)) with check (private.is_org_member(org_id, true));

create policy assignment_reqs_read on public.assignment_requirements for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id));
create policy assignment_reqs_write on public.assignment_requirements for all to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and private.is_org_member(a.org_id, true)))
  with check (exists (select 1 from public.assignments a where a.id = assignment_id and private.is_org_member(a.org_id, true)));

-- ---------- share grants ----------
create policy grants_owner_read on public.share_grants for select to authenticated
  using (clinician_id = private.my_clinician_id());
create policy grants_owner_insert on public.share_grants for insert to authenticated
  with check (clinician_id = private.my_clinician_id() and status = 'ACTIVE' and revoked_at is null and used_at is null);
create policy grants_owner_update on public.share_grants for update to authenticated
  using (clinician_id = private.my_clinician_id()) with check (clinician_id = private.my_clinician_id());
-- Orgs see grant metadata (status, expiry, revoked_at) for their own org only.
create policy grants_org_read on public.share_grants for select to authenticated
  using (private.is_org_member(org_id));

create policy assertions_owner on public.share_grant_assertions for all to authenticated
  using (private.owns_grant(grant_id)) with check (private.owns_grant(grant_id));
-- Orgs: only while the grant is live and scoped to their org.
create policy assertions_org_live on public.share_grant_assertions for select to authenticated
  using (private.is_org_member(private.grant_org(grant_id)) and private.grant_is_live(grant_id));

create policy access_events_read on public.share_access_events for select to authenticated
  using (private.owns_grant(grant_id) or private.is_org_member(org_id) or private.is_verifier());

create policy ext_read on public.extension_requests for select to authenticated
  using (private.owns_grant(grant_id) or private.is_org_member(org_id));
create policy ext_org_request on public.extension_requests for insert to authenticated
  with check (private.is_org_member(org_id) and org_id = private.grant_org(grant_id)
              and requested_by = auth.uid() and status = 'PENDING' and resolved_at is null
              and exists (select 1 from public.share_grants g where g.id = grant_id and g.status <> 'REVOKED'));
-- Only the clinician resolves a request (an org can never extend its own access).
create policy ext_owner_resolve on public.extension_requests for update to authenticated
  using (private.owns_grant(grant_id)) with check (private.owns_grant(grant_id));

-- ---------- monitoring, audit, proofs, analytics ----------
create policy monitoring_read on public.monitoring_events for select to authenticated
  using (private.is_verifier() or private.owns_credential(credential_id));
create policy monitoring_insert on public.monitoring_events for insert to authenticated
  with check (private.is_verifier() and actor_user_id = auth.uid());

create policy audit_read on public.audit_events for select to authenticated
  using (private.is_verifier() or clinician_id = private.my_clinician_id() or private.is_org_member(org_id));
create policy audit_insert on public.audit_events for insert to authenticated
  with check (actor_user_id = auth.uid()
              and (clinician_id is null or clinician_id = private.my_clinician_id() or private.is_verifier())
              and (org_id is null or private.is_org_member(org_id) or clinician_id = private.my_clinician_id())
              and (actor_type <> 'VERIFIER' or private.is_verifier()));

create policy proofs_owner on public.proofs for all to authenticated
  using (private.owns_credential(credential_id)) with check (private.owns_credential(credential_id));
create policy proofs_verifier_read on public.proofs for select to authenticated using (private.is_verifier());

create policy analytics_insert on public.analytics_events for insert to authenticated
  with check ((clinician_id is null or clinician_id = private.my_clinician_id())
              and (org_id is null or private.is_org_member(org_id)));
create policy analytics_read on public.analytics_events for select to authenticated
  using (private.is_verifier() or private.is_org_member(org_id) or clinician_id = private.my_clinician_id());
