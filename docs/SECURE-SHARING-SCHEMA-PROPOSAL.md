# Secure Passport sharing, Audit Vault and signed snapshots: proposed production changes (NOT APPLIED)

Status: **proposal only.** There is no migration, no database change and no real signing key. The demo lives in `js/secure-passport.js` (engine) and `js/secure-share-ui.js` (UI) and stores its data in the browser under `veridun_secure_share_v1`.

**Veridun Verify is not built.** Every "primary-source verified" state in this PR comes from the demo seed. It is flagged `demo:true` and labeled DEMO in the UI. Real user data is never shown as verified.

## Implemented (mock)
- **Share modes:** secure live, assignment-specific, printable/PDF snapshot, audit packet and QR.
- **Recipient-bound grants:** each grant has a recipient email, a role (recruiter / credentialing specialist / compliance-auditor), a purpose, a duration (one-time / 24h / 7d / 30d / contract end / until revoked) and the categories it shares. Revocation takes effect immediately.
- **Category floors:** health and background need at least the credentialing role, and source documents need compliance-auditor. Sensitive categories are off by default.
- **Progressive disclosure:** sensitive items show "Requirement satisfied: YES/NO" only.
- **Access log:** append-only and off-chain. It never holds document contents.
- **Snapshot:** canonical JSON → SHA-256 → signature. It is signed with HMAC-SHA256 using a **public DEMO key** labeled as such, and the XRPL anchor ref is mocked. The QR holds only `?vsnap=<hash prefix>`. The verification page shows one of four states: authentic & current, outdated ("One credential changed since this snapshot"), revoked, or not authentic.
- **Audit Vault:** a per-credential, append-only, hash-chained version history. It covers source, PSV record (demo), verifier, timestamps, evidence ref (visible to auditor/nurse only), supersession and revocation, with an integrity check.
- **Audit packet:** generated per assignment, role and permissions, and signed with the demo key. There is never one static packet.
- **ZK:** predicate stubs only (`implemented:false`).

## Proposed production design (separate PRs, staging first)
```sql
create table share_grants (
  id uuid primary key, clinician_id uuid not null references clinicians(id),
  token_hash text not null unique,                 -- store only a hash of the link token
  mode text not null, recipient_email citext not null,
  recipient_role text not null check (recipient_role in ('RECRUITER','CREDENTIALING','COMPLIANCE_AUDITOR')),
  organization_id uuid references organizations(id), assignment_id uuid, purpose text not null,
  duration text not null, expires_at timestamptz, categories text[] not null,
  status text not null default 'ACTIVE', views int not null default 0, created_at timestamptz default now(), revoked_at timestamptz
);
create table share_access_log (                    -- append-only (insert-only grant, no update/delete)
  id bigserial primary key, grant_id uuid references share_grants(id), at timestamptz default now(),
  actor_user_id uuid, actor_role text, action text, result text, reason text   -- no document contents, no PHI
);
create table passport_snapshots (id uuid primary key, clinician_id uuid, sha256 text unique, canonical_json jsonb,
  signature jsonb, key_id text, anchor_ref jsonb, revoked_at timestamptz, created_at timestamptz default now());
create table credential_vault_entries (            -- append-only, hash-chained
  id bigserial primary key, credential_id uuid not null, version int not null, event text not null,
  source text, psv_record jsonb, verifier text, at timestamptz not null, evidence_document_id uuid,
  supersedes int, revokes int, prev_hash text, entry_hash text not null, unique(credential_id, version, event)
);
```
- **Recipient binding:** the recipient signs in (magic link or SSO) and the session email must match `recipient_email`. Role floors are enforced in RLS and the API, not in the client.
- **Signing:** a server-side Ed25519 key held in a KMS/secret manager. The public key is published for verifiers, and keys are rotated via `key_id`. The demo HMAC key is removed. No key or seed is ever committed.
- **PDF:** rendered server-side from the signed canonical JSON, with the hash and QR embedded.
- **Snapshot verification endpoint:** returns the state only (authentic/current/outdated/revoked/tampered), never credential details.
- **Evidence:** documents stay in private storage and are reachable only through short-lived signed URLs for compliance-auditor grants. They never go on-chain.
- **XRPL:** only `{hash, issuer, time, status}`. It stays downstream of verification and hidden from the default UI.

## Open decisions
1. Must recruiters sign in to open a link, or is a token plus email OTP enough?
2. Does a one-time link count a view when the page is opened, or only when a section is expanded?
3. Should a snapshot auto-revoke when any included credential is revoked? The mock reports it as REVOKED on verification.
