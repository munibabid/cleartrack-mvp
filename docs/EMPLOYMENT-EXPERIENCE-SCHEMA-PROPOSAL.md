# Employment & Specialty Experience: proposed production/schema changes (NOT APPLIED)

Status: **proposal only.** This PR changes no database objects, adds no migration and calls no external model.
Everything below needs separate approval. It ships as its own staging-only migration PR, in line with the v14.9 order.

## What this PR ships (client/mock only)
- `js/employment-experience.js` is a pure engine that runs in the browser and in Node. It covers episodes, append-only attestations, field-level status derivation, experience calculation, the Sentinel/Match requirement preview, the mock resume extractor, the employer-issued credential shape and the on-chain payload.
- `js/employment-ui.js` adds the Passport "Employment & Specialty Experience" card and keeps demo episodes in a browser-only store (`localStorage` key `veridun_employment_v1`).
- Wording: the old "verified by employer" labels are removed. The typed years/months fields are now labeled self-reported. The existing `EMP_<ID>_VERIFIED` readiness item and its `metadata.{years,recent_months,last_worked_on}` are left in place so current readiness and database rows keep working unchanged.

## Smallest compatible production extension (proposed)
These are new tables only. No existing column changes meaning.

```sql
create table employment_episodes (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references clinicians(id),
  origin text not null check (origin in ('NURSE_ENTRY','RESUME','EMPLOYER_CREDENTIAL')),
  claim jsonb not null,            -- {employer, role, specialty, subspecialty, start (YYYY-MM), end|null}
  created_at timestamptz not null default now()
);  -- claim is immutable; corrections are a new episode or a new attestation

create table employment_attestations (       -- APPEND-ONLY (no UPDATE/DELETE grants; trigger rejects them)
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references employment_episodes(id),
  seq int not null, unique (episode_id, seq),
  source text not null, verifier text not null, verified_at timestamptz not null,
  evidence_level char(1) not null check (evidence_level in ('A','B','C','D','E')),
  evidence_type text not null,
  fields_confirmed jsonb not null default '{}',   -- exactly what the source proves
  fields_disputed text[] not null default '{}',
  not_provable text[] not null default '{}',      -- e.g. specialty from a level D source
  revokes uuid references employment_attestations(id),
  issuer_credential jsonb,                        -- employer-signed credential reference + validation result
  hash_version text not null, attestation_hash text not null,
  proof_ref jsonb,                                -- XRPL anchor reference (hash only)
  source_document_id uuid references source_documents(id)  -- private storage, off-chain (Phase 3 table)
);
```
- Check constraint or trigger: level D can never have `fields_confirmed ? 'specialty'`, and level E always has `fields_confirmed = '{}'`.
- Revocation is a new row with `revokes` set. Rows are never edited.
- Field statuses and experience totals are **derived** (view or function). They are never stored as editable numbers.
- RLS: the nurse can read their own rows and insert level E only. Levels A–D are inserted by the verifier/service role only. Organizations see derived facts through existing share grants, never documents.
- Assignment rules: add an optional `experience_rule jsonb` to `requirements` (`{minTotalMonths, minRecentMonths, recentLookbackMonths, lastWorkedWithinMonths, acceptedSubspecialties[]}`). The existing `min_months`/window columns map onto it.
- Deprecation: `credentials.metadata.years/recent_months` stays readable as self-reported only and is never fed into verified totals.

## On-chain
The XRPL memo holds `{v, hashVersion, attestationHash, issuer:'Veridun', issuedAt, status}` only. No names, employers, dates, resumes, HR letters, payroll or PII. The mock hash (`mock-fnv1a32-canonical-v0`) is replaced by SHA-256 over canonical JSON before anything is anchored.

## Open decisions for Munib
1. Can level C (manager verification) verify specialty, or only corroborate it? The current mock treats it as able to verify.
2. Does a later verification clear an earlier dispute automatically? The current mock says no: the dispute stands until it is revoked.
3. Do CORROBORATED periods (level D) ever count toward experience? The current mock says never.
4. Should resume extraction use the certified Intake runtime once it exists? Until then it stays mock only.
