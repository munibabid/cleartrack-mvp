-- PR 13 follow-up from the post-apply advisor check on staging.
-- Migration 6 revoked INSERT/UPDATE/DELETE on the XRPL anchor tables but left
-- Supabase's default TRUNCATE (which bypasses RLS), REFERENCES and TRIGGER
-- grants for the API roles. Clients only ever need SELECT (through RLS).
revoke truncate, references, trigger on public.verification_anchors from anon, authenticated;
revoke truncate, references, trigger on public.audit_anchors from anon, authenticated;
-- Trigger function added in migration 7: no direct EXECUTE for anyone.
revoke all on function private.requirements_level_floor() from public;
