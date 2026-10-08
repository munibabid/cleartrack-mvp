-- Veridun backend groundwork, migration 3 of 3: share access functions + private document storage.

-- ---------- reading a share (the only way an org sees credential data) ----------
-- Returns sanitized, LIVE assertions for a grant. Checks, in one place:
--   caller is a member of the grant's org (or the owning clinician),
--   grant is ACTIVE, unexpired, unrevoked, and not a used one-time grant.
-- Every call is logged in share_access_events (+ audit_events); refusals too.
-- PRIVATE kinds come back as "Requirement Satisfied" only: no name, dates,
-- issuer, results or documents. Source documents are never returned.
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

-- Cross-device link: the share URL carries a random token; the database only
-- stores sha256(token). The caller must be signed in as a member of the org.
create or replace function public.access_share_by_token(p_token text)
returns table (requirement_label text, label text, mode public.assertion_mode, status text,
               expires_on date, issuer text, jurisdiction_code text)
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'invalid token' using errcode = '22023'; end if;
  select id into v_id from public.share_grants
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_id is null then raise exception 'share not found' using errcode = 'P0002'; end if;
  return query select * from public.get_share_assertions(v_id);
end $$;

-- Clinician revokes: immediate; pending extension requests are declined.
create or replace function public.revoke_share_grant(p_grant uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare g public.share_grants;
begin
  if not private.owns_grant(p_grant) then raise exception 'not your share' using errcode = '42501'; end if;
  update public.share_grants set status = 'REVOKED', revoked_at = now() where id = p_grant and status <> 'REVOKED'
    returning * into g;
  update public.extension_requests set status = 'DECLINED', resolved_at = now(), resolved_by = auth.uid()
    where grant_id = p_grant and status = 'PENDING';
  if g.id is not null then
    insert into public.audit_events (event_type, actor_user_id, actor_type, clinician_id, org_id, assignment_id, grant_id, result)
      values ('SHARE_REVOKED', auth.uid(), 'CLINICIAN', g.clinician_id, g.org_id, g.assignment_id, p_grant, 'REVOKED');
  end if;
end $$;

-- Clinician approves or declines an org's extension request.
-- Approval extends to 23:59:59 UTC on the requested date (the client may
-- convert to the clinician's local end of day before calling).
create or replace function public.resolve_extension_request(p_request uuid, p_approve boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.extension_requests;
begin
  select * into r from public.extension_requests where id = p_request for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if not private.owns_grant(r.grant_id) then raise exception 'not your share' using errcode = '42501'; end if;
  if r.status <> 'PENDING' then raise exception 'request already resolved' using errcode = '22023'; end if;
  update public.extension_requests set status = case when p_approve then 'APPROVED'::public.extension_status else 'DECLINED'::public.extension_status end,
         resolved_at = now(), resolved_by = auth.uid() where id = p_request;
  if p_approve then
    update public.share_grants
       set duration = 'CUSTOM_DATE', custom_until = r.requested_until,
           expires_at = (r.requested_until + 1)::timestamp at time zone 'UTC' - interval '1 second',
           status = case when status = 'EXPIRED' then 'ACTIVE'::public.share_status else status end, expired_at = null
     where id = r.grant_id and status <> 'REVOKED';
  end if;
  insert into public.audit_events (event_type, actor_user_id, actor_type, clinician_id, org_id, grant_id, result, detail)
    select case when p_approve then 'SHARE_EXTENDED' else 'SHARE_EXTENSION_DECLINED' end, auth.uid(), 'CLINICIAN',
           g.clinician_id, g.org_id, g.id, case when p_approve then 'APPROVED' else 'DECLINED' end,
           jsonb_build_object('request_id', p_request, 'requested_until', r.requested_until)
      from public.share_grants g where g.id = r.grant_id;
end $$;

-- Housekeeping: mark lapsed grants EXPIRED (schedule with pg_cron, e.g. every 15 min).
-- Access checks never depend on this having run.
create or replace function private.sweep_expired_grants() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  update public.share_grants set status = 'EXPIRED', expired_at = now()
   where status = 'ACTIVE' and expires_at is not null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function private.sweep_expired_grants() from authenticated;

revoke execute on function public.get_share_assertions(uuid), public.access_share_by_token(text),
  public.revoke_share_grant(uuid), public.resolve_extension_request(uuid, boolean) from public, anon;
grant execute on function public.get_share_assertions(uuid), public.access_share_by_token(text),
  public.revoke_share_grant(uuid), public.resolve_extension_request(uuid, boolean) to authenticated;

-- ---------- private storage for source documents ----------
-- Bucket is private (no public URLs). Objects live under "<auth.uid()>/<credential-id>/<file>".
-- Clinicians manage their own folder; verifiers may read for manual review.
-- Downloads use short-lived signed URLs created with the user's JWT, e.g.
--   supabase.storage.from('source-documents').createSignedUrl(path, 60)
-- Organizations have no access: documents are never shared.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('source-documents', 'source-documents', false, 10485760,
        array['application/pdf','image/png','image/jpeg','application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false;

create policy source_docs_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'source-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy source_docs_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'source-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy source_docs_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'source-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'source-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy source_docs_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'source-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy source_docs_verifier_read on storage.objects for select to authenticated
  using (bucket_id = 'source-documents' and private.is_verifier());
