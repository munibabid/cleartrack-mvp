# Education model: proposed production/schema changes (NOT APPLIED)

Status: **proposal only.** There is no migration, no database change and no external call. The demo is client/mock only: `js/education.js` and `js/education-ui.js`, with the browser key `veridun_education_v1`.

## Rules implemented in the mock
- Education is optional. Onboarding shows "Add your nursing education. Verification may only be required if an employer or assignment requires a specific degree." with the actions [Add education] / [Skip for now]. No upload is required.
- Degrees are DIPLOMA, ASN (ASN/ADN), BSN, MSN and OTHER. The fields are school, optional graduation year/date and program.
- Record states:
  - **SELF-ATTESTED**
  - **DOCUMENT-SUPPORTED:** a document was uploaded but not confirmed. This state is never shown as verified.
  - **PRIMARY-SOURCE VERIFIED:** the institution and degree type were both confirmed by a registrar, a university API, official transcript verification, the National Student Clearinghouse or an institution-signed credential.
- Field-level verification covers institution, degreeType, gradDate and program. Each field carries its own source.
- Source domains stay separate: licensure, education, employment and certifications. Nursys, license boards, employer and certification sources are rejected as education sources.
- No GPA, coursework or transcripts are collected; unknown claim fields are dropped. Documents stay private and off-chain. Only a mock attestation hash and proof reference exist.

## Assignment rule
A rule is `{mode: REQUIRED|PREFERRED|NOT_REQUIRED, minDegree}`. The results are:
- **NOT_APPLICABLE:** there is no rule, so education is ignored. This never makes a nurse "not ready".
- **PASS**
- **PENDING_EDUCATION_VERIFICATION:** the degree is self-attested or document-supported only. This blocks a REQUIRED rule.
- **FAIL:** with a reason.
- **QUALIFIED_PREFERENCE_NOT_MET:** the degree is preferred and not met. This does not block.
- **QUALIFIED_PREFERENCE_PENDING:** the preferred degree is claimed but not yet verified. This does not block.

## Proposed tables (future, staging-first, separate PR)
```sql
create table education_records (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references clinicians(id),
  degree_type text not null check (degree_type in ('DIPLOMA','ASN','BSN','MSN','OTHER')),
  degree_other text, institution text not null, program text, grad_date text,   -- 'YYYY' or 'YYYY-MM'
  created_at timestamptz not null default now()
);   -- no GPA / coursework / transcript columns, by design
create table education_attestations (            -- append-only; revocation = new row with revokes
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references education_records(id), seq int not null, unique(record_id,seq),
  source text not null,
  source_type text not null check (source_type in ('REGISTRAR','UNIVERSITY_API','OFFICIAL_TRANSCRIPT_VERIFICATION','NATIONAL_STUDENT_CLEARINGHOUSE','INSTITUTION_SIGNED_CREDENTIAL')),
  verifier text not null, verified_at timestamptz not null,
  fields_confirmed jsonb not null default '{}', fields_disputed text[] not null default '{}',
  revokes uuid references education_attestations(id),
  hash_version text not null, attestation_hash text not null, proof_ref jsonb
);
create table education_documents (record_id uuid references education_records(id), source_document_id uuid references source_documents(id), uploaded_at timestamptz);  -- private storage
```
- Add `education_rule jsonb` (`{mode, minDegree}`) to `requirements`, or add an EDUCATION requirement kind. A missing rule means education is not evaluated.
- RLS: the nurse inserts records and documents. Only the verifier or service role inserts attestations. Organizations see derived results through existing share grants and never see documents.

## Open decisions
1. Should "Other" degrees ever satisfy a minimum degree rule? In the mock, Other ranks 0 and never satisfies one.
2. Should a primary source that confirms a lower degree than claimed raise DISPUTED automatically? The mock leaves the claim pending.
