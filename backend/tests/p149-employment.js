#!/usr/bin/env node
/* v14.9 Employment & Specialty Experience — engine tests (Munib t159u). Offline, no DB, no network,
   no external model. Written against js/employment-experience.js.
   Usage: node backend/tests/p149-employment.js */
const E = require('../../js/employment-experience.js');
const R = []; const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (!c && i !== '' ? ' — ' + JSON.stringify(i).slice(0, 300) : ''); R.push(l); console.log(l); return c; };
const AS_OF = '2026-10';
const ep = (claim, origin) => E.createEpisode(claim, origin || 'NURSE_ENTRY', { at: '2026-01-01T00:00:00Z' });
const full = (e, lvl, conf, extra = {}) => E.appendAttestation(e, { source: 'src', verifier: 'v', evidenceLevel: lvl, evidenceType: 'T', confirms: conf, at: '2026-02-01T00:00:00Z', ...extra });

// --- month math
ok('month set inclusive: Jan 2024 – Feb 2026 = 26 months', E.monthSet('2024-01', '2026-02', AS_OF).size === 26);
ok('present end counts through as-of month', E.monthSet('2026-01', null, AS_OF).size === 10);
ok('future end capped at as-of', E.monthSet('2026-09', '2027-05', AS_OF).size === 2);
ok('end before start = 0 months', E.monthSet('2025-05', '2025-01', AS_OF).size === 0);

// --- claim only
let a = ep({ employer: 'Sharp Memorial Hospital', role: 'Registered Nurse', specialty: 'ICU', start: '2024-01', end: '2026-02' });
let s = E.fieldStatuses(a);
ok('nurse claim alone: every field SELF-ATTESTED, none VERIFIED', E.FIELDS.every(f => s[f].status === 'SELF-ATTESTED'), s);
ok('claim history starts with one level E entry', a.history.length === 1 && a.history[0].evidenceLevel === 'E' && Object.keys(a.history[0].fieldsConfirmed).length === 0);
ok('claim only: 26 claimed months, 0 verified', (x => x.claimedMonths === 26 && x.verifiedMonths === 0 && x.lastVerifiedMonth === null)(E.calculateExperience([a], 'ICU', { asOf: AS_OF })));
ok('missing claim field → UNVERIFIED (not SELF-ATTESTED)', E.fieldStatuses(ep({ employer: 'X', start: '2024-01' })).specialty.status === 'UNVERIFIED');

// --- level A all fields
a = full(a, 'A', { employer: 'Sharp Memorial Hospital', role: 'RN', dates: { start: '2024-01', end: '2026-02' }, specialty: 'ICU' });
s = E.fieldStatuses(a);
ok('level A confirming all fields: all VERIFIED at level A', E.FIELDS.every(f => s[f].status === 'VERIFIED' && s[f].level === 'A'), s);
let x = E.calculateExperience([a], 'ICU', { asOf: AS_OF });
ok('verified 26 months; 16 in last 24 (Nov 2024–Feb 2026); last verified 2026-02, 8 months ago', x.verifiedMonths === 26 && x.recentVerifiedMonths === 16 && x.lastVerifiedMonth === '2026-02' && x.monthsSinceLastVerified === 8, x);

// --- HR letter without specialty (t159u example)
let b = ep({ employer: 'Hospital XYZ', role: 'RN', specialty: 'ICU', start: '2022-06', end: '2023-12' });
b = full(b, 'C', { employer: 'Hospital XYZ', role: 'RN', dates: { start: '2022-06', end: '2023-12' } });
s = E.fieldStatuses(b);
ok('HR confirms employer/role/dates but not ICU: three VERIFIED, specialty stays SELF-ATTESTED', s.employer.status === 'VERIFIED' && s.role.status === 'VERIFIED' && s.dates.status === 'VERIFIED' && s.specialty.status === 'SELF-ATTESTED', s);
ok('…and that episode adds 0 verified ICU months (no inference from the claim)', E.calculateExperience([b], 'ICU', { asOf: AS_OF }).verifiedMonths === 0);
ok('…wording: "ICU specialty based on nurse attestation"', E.fieldPhrase('specialty', s.specialty, 'ICU') === 'ICU specialty based on nurse attestation');
ok('…wording: "Employment verified" / "RN role verified" / "Employment dates verified"', E.fieldPhrase('employer', s.employer) === 'Employment verified' && E.fieldPhrase('role', s.role) === 'RN role verified' && E.fieldPhrase('dates', s.dates) === 'Employment dates verified');
ok('claimed total includes both episodes (26 + 19 = 45); verified stays 26', (x => x.claimedMonths === 45 && x.verifiedMonths === 26)(E.calculateExperience([a, b], 'ICU', { asOf: AS_OF })));

// --- level D
let d = ep({ employer: 'Agency', role: 'RN', specialty: 'ICU', subspecialty: 'CVICU', start: '2021-03', end: '2022-05' });
d = full(d, 'D', { employer: 'Agency', role: 'RN', dates: { start: '2021-03', end: '2022-05' }, specialty: 'CVICU' });
s = E.fieldStatuses(d);
ok('level D: employer/role/dates CORROBORATED (not VERIFIED)', ['employer', 'role', 'dates'].every(f => s[f].status === 'CORROBORATED'), s);
ok('level D cannot prove specialty: recorded as notProvable, not confirmed', d.history[1].notProvable.includes('specialty') && d.history[1].fieldsConfirmed.specialty === undefined && s.specialty.status === 'SELF-ATTESTED');
ok('level D episode adds 0 verified months', E.calculateExperience([d], 'ICU', { asOf: AS_OF }).verifiedMonths === 0);

// --- level E never verifies
let e = full(ep({ employer: 'Y', role: 'RN', specialty: 'ICU', start: '2020-01', end: '2020-12' }), 'E', { employer: 'Y', role: 'RN', dates: { start: '2020-01', end: '2020-12' }, specialty: 'ICU' });
ok('level E "confirmations" are dropped; nothing becomes VERIFIED', E.FIELDS.every(f => E.fieldStatuses(e)[f].status !== 'VERIFIED') && Object.keys(e.history[1].fieldsConfirmed).length === 0);
ok('unknown evidence level throws', (() => { try { full(e, 'Z', {}); return false } catch (_) { return true } })());

// --- partial verification: source confirmed dates differ → verified uses the source's dates
let p = ep({ employer: 'Z', role: 'RN', specialty: 'ICU', start: '2023-01', end: '2025-08' });
p = full(p, 'B', { employer: 'Z', role: 'RN', dates: { start: '2023-06', end: '2025-08' }, specialty: 'MICU' });
x = E.calculateExperience([p], 'ICU', { asOf: AS_OF });
ok('verified months use the source-confirmed dates (27), claimed uses the claim (32)', x.verifiedMonths === 27 && x.claimedMonths === 32, x);
ok('subspecialty MICU counts toward ICU family', x.verifiedMonths === 27);
ok('accepted subspecialties [CVICU] exclude MICU', E.calculateExperience([p], 'ICU', { asOf: AS_OF, accepted: ['CVICU'] }).verifiedMonths === 0);
ok('non-RN verified role does not count', E.calculateExperience([full(ep({ employer: 'Q', role: 'LPN', specialty: 'ICU', start: '2024-01', end: '2024-12' }), 'A', { employer: 'Q', role: 'LPN', dates: { start: '2024-01', end: '2024-12' }, specialty: 'ICU' })], 'ICU', { asOf: AS_OF }).verifiedMonths === 0);

// --- overlap
let o = full(ep({ employer: 'O', role: 'RN', specialty: 'ICU', start: '2025-01', end: '2025-06' }), 'A', { employer: 'O', role: 'RN', dates: { start: '2025-01', end: '2025-06' }, specialty: 'ICU' });
ok('overlapping verified episodes are not double counted', E.calculateExperience([a, o], 'ICU', { asOf: AS_OF }).verifiedMonths === 26);

// --- disputes and revocation, append-only
let dz = full(a, 'C', {}, { disputes: ['specialty'] });
ok('a dispute marks the field DISPUTED and removes verified months', E.fieldStatuses(dz).specialty.status === 'DISPUTED' && E.calculateExperience([dz], 'ICU', { asOf: AS_OF }).verifiedMonths === 0);
const before = JSON.stringify(a.history);
let rv = E.revokeAttestation(a, a.history[1].id, 'issued in error', '2026-03-01T00:00:00Z');
ok('revocation appends a new entry; the original entries are unchanged', rv.history.length === 3 && JSON.stringify(rv.history.slice(0, 2)) === before && rv.history[2].revokes === a.history[1].id);
ok('revoked attestation no longer verifies; status REVOKED', E.fieldStatuses(rv).employer.status === 'SELF-ATTESTED' && E.entryRevocationStatus(rv, rv.history[1]) === 'REVOKED' && E.calculateExperience([rv], 'ICU', { asOf: AS_OF }).verifiedMonths === 0);
ok('history entries are frozen (cannot be edited in place)', (() => { 'use strict'; try { a.history[1].evidenceLevel = 'E'; } catch (_) {} try { a.history.push({}); } catch (_) {} return a.history[1].evidenceLevel === 'A' && a.history.length === 2; })());
ok('appendAttestation returns a new episode and leaves the old one unchanged', a.history.length === 2 && rv !== a);
const h = a.history[1];
ok('each entry records source, verifier, date, fields confirmed, evidence type, hash version, proof ref, revocation status', ['source', 'verifier', 'verifiedAt', 'fieldsConfirmed', 'evidenceType', 'evidenceLevel', 'hashVersion', 'hash', 'proofRef', 'revocationStatus'].every(k => k in h));
ok('proof refs are explicitly mocked and not anchored', h.proofRef.mocked === true && h.proofRef.anchored === false && /^MOCK-/.test(h.proofRef.ref));
ok('hash is deterministic over canonical content', E.mockHash({ b: 1, a: [2, { d: 1, c: 2 }] }) === E.mockHash({ a: [2, { c: 2, d: 1 }], b: 1 }));

// --- on-chain privacy
const pay = E.anchorPayload(a, h), ps = JSON.stringify(pay);
ok('anchor payload has no employer, role, dates, specialty, nurse or document data', !/Sharp|Hospital|RN|2024-01|ICU|Alex|resume/i.test(ps.replace(/"hashVersion":"[^"]*"/, '')) && Object.keys(pay).sort().join() === 'attestationHash,hashVersion,issuedAt,issuer,mocked,status,v', pay);

// --- resume
const rz = E.mockExtractResume('Sharp Memorial | ICU RN | Jan 2023 – Aug 2025\nHospital XYZ | Registered Nurse, CVICU | 06/2022 - Present\nnot an employment line\nBad | RN | Foo – Bar');
ok('mock resume extractor: 2 drafts, no external model, SELF-REPORTED', rz.drafts.length === 2 && rz.externalModelCalled === false && rz.drafts.every(d => d.status === 'SELF-REPORTED'), rz);
ok('extractor reads dates and subspecialty', rz.drafts[0].start === '2023-01' && rz.drafts[0].end === '2025-08' && rz.drafts[1].subspecialty === 'CVICU' && rz.drafts[1].specialty === 'ICU' && rz.drafts[1].end === null);
const fromResume = E.episodesFromReviewedResume([{ ...rz.drafts[0], employer: 'Sharp Memorial Hospital', status: 'VERIFIED', fieldsConfirmed: { specialty: 'ICU' }, evidenceLevel: 'A' }, { ...rz.drafts[1], accepted: false }]);
ok('reviewed resume → only accepted, nurse-corrected drafts become episodes', fromResume.length === 1 && fromResume[0].claim.employer === 'Sharp Memorial Hospital' && fromResume[0].origin === 'RESUME');
ok('a resume never creates VERIFIED data, even if the draft claims it', E.FIELDS.every(f => E.fieldStatuses(fromResume[0])[f].status === 'SELF-ATTESTED') && E.calculateExperience(fromResume, 'ICU', { asOf: AS_OF }).verifiedMonths === 0 && fromResume[0].history.every(x => x.evidenceLevel === 'E'));

// --- requirements (Hospitals A–E)
const H = { A: { minTotalMonths: 12 }, B: { minTotalMonths: 24 }, C: { minTotalMonths: 36 }, D: { minTotalMonths: 24, minRecentMonths: 12, recentLookbackMonths: 24 }, E: { minTotalMonths: 24, lastWorkedWithinMonths: 12 } };
const ev = (r, eps = [a, b, d]) => E.evaluateExperienceRequirement(eps, { label: 'H', specialty: 'ICU', ...r }, { asOf: AS_OF });
ok('Hospital A ≥12: QUALIFIED', ev(H.A).status === 'QUALIFIED');
ok('Hospital B ≥24: QUALIFIED', ev(H.B).status === 'QUALIFIED');
const c = ev(H.C);
ok('Hospital C ≥36: NOT_YET_QUALIFIED, required 36, available 26, gap 10', c.status === 'NOT_YET_QUALIFIED' && c.rules[0].required === 36 && c.rules[0].available === 26 && c.rules[0].gap === 10, c.rules);
ok('…claimed-only months are reported, not counted', c.claimedOnlyMonths === c.experience.claimedMonths - 26 && c.claimedOnlyMonths > 0);
ok('Hospital D ≥24 AND ≥12 in last 24: both rules PASS', (r => r.status === 'QUALIFIED' && r.rules.length === 2 && r.rules.every(z => z.pass))(ev(H.D)));
ok('Hospital E ≥24 AND last worked within 12: PASS (8 months ago)', (r => r.status === 'QUALIFIED' && r.rules[1].available === 8)(ev(H.E)));
ok('last worked within 6: FAIL with gap 2', (r => r.status === 'NOT_YET_QUALIFIED' && r.rules[0].gap === 2)(ev({ lastWorkedWithinMonths: 6 })));
ok('no verified work: last-worked rule FAILs (never passes on null)', (r => !r.rules[0].pass && r.rules[0].available === null)(ev({ lastWorkedWithinMonths: 120 }, [b, d])));
ok('no rules configured → NO_RULES, never QUALIFIED', ev({}).status === 'NO_RULES');
ok('requirement evaluation does not mutate Passport facts', (() => { const j = JSON.stringify([a, b, d]); ev(H.D); return JSON.stringify([a, b, d]) === j })());
ok('manual totals cannot become verified: no year/month total input is read', (() => { const z = { ...b, claim: { ...b.claim }, years: 40, recentMonths: 24, verifiedMonths: 999 }; return E.calculateExperience([z], 'ICU', { asOf: AS_OF }).verifiedMonths === 0 })());

// --- employer-issued credential (data shape)
const vc = { type: 'EmployerEmploymentCredential', version: '0', issuer: { name: 'Hospital X', id: 'did:example:hx' }, subjectRef: 'passport:demo', claims: { role: 'RN', specialty: 'ICU', subspecialty: 'CVICU', start: '2028-02', end: '2030-11' }, issuedAt: '2030-12-01', proof: { type: 'Ed25519Signature2020', verificationMethod: 'did:example:hx#k1', signature: 'zMOCK' } };
const base = ep({ employer: 'Hospital X', role: 'RN', specialty: 'ICU', subspecialty: 'CVICU', start: '2028-02', end: '2030-11' });
const unval = E.importEmployerCredential(base, vc, null);
ok('employer credential without signature validation: recorded as claim, nothing verified', E.FIELDS.every(f => E.fieldStatuses(unval)[f].status !== 'VERIFIED') && unval.history[1].issuerCredential.validation.valid === false);
const val = E.importEmployerCredential(base, vc, () => ({ valid: true, issuerTrusted: true, mocked: true }));
ok('validated employer credential → level A, all four fields VERIFIED, provenance kept', E.FIELDS.every(f => E.fieldStatuses(val)[f].status === 'VERIFIED' && E.fieldStatuses(val)[f].level === 'A') && val.history[1].evidenceType === 'EMPLOYER_SIGNED_CREDENTIAL' && val.history[1].issuerCredential.issuer.id === 'did:example:hx');
ok('untrusted issuer with valid signature still not verified', E.FIELDS.every(f => E.fieldStatuses(E.importEmployerCredential(base, vc, () => ({ valid: true, issuerTrusted: false })))[f].status !== 'VERIFIED'));

const f = R.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
