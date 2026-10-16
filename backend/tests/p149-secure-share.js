#!/usr/bin/env node
/* v14.9 Secure sharing / Audit Vault / signed snapshots — engine tests (Munib t163u). Offline, mock only.
   Usage: node backend/tests/p149-secure-share.js */
const S = require('../../js/secure-passport.js');
const R = []; const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (!c && i !== '' ? ' — ' + JSON.stringify(i).slice(0, 300) : ''); R.push(l); console.log(l); return c; };
const throws = f => { try { f(); return false } catch (_) { return true } };
const T0 = Date.parse('2026-10-16T12:00:00Z');
const P = () => ({ id: 'pp-demo', holder: 'Alex Morgan (DEMO)', items: [
  { id: 'lic-az', kind: 'RN_LICENSE_MULTISTATE', label: 'Arizona RN License · Multistate', category: 'LICENSES', status: 'VERIFIED', demoVerified: true, version: 1, expires: '2028-04-01', source: 'Arizona Board of Nursing (DEMO)', documentRef: 'private:lic' },
  { id: 'bls', kind: 'CERT_BLS', label: 'BLS', category: 'CERTIFICATIONS', status: 'VERIFIED', demoVerified: true, version: 1, expires: '2027-11-01' },
  { id: 'tb', kind: 'HEALTH_TB_CURRENT', label: 'TB screening', category: 'SENSITIVE_HEALTH', status: 'VERIFIED', demoVerified: true, version: 1, requirementSatisfied: true, documentRef: 'private:tb' },
  { id: 'bg', kind: 'SCREEN_BACKGROUND_CURRENT', label: 'Background check', category: 'BACKGROUND', status: 'VERIFIED', demoVerified: true, version: 1, requirementSatisfied: true },
  { id: 'edu', kind: 'EDU_BSN', label: 'BSN', category: 'EDUCATION', status: 'SELF-ATTESTED', version: 1 }] });
const rec = (role, extra = {}) => ({ recipient: { email: 'Pat@Hospital.example', role, org: 'Demo Hospital' }, purpose: 'Boston Travel ICU credentialing', duration: 'D7', now: T0, ...extra });
(async () => {
  // roles / categories
  ok('sensitive categories default off for every role', ['RECRUITER', 'CREDENTIALING', 'COMPLIANCE_AUDITOR'].every(r => !S.defaultCategories(r).some(c => S.CATEGORIES[c].sensitive)));
  ok('recruiter cannot be granted health, background or source documents', ['SENSITIVE_HEALTH', 'BACKGROUND', 'SOURCE_DOCUMENTS'].every(c => throws(() => S.createGrant(rec('RECRUITER', { categories: ['LICENSES', c] })))));
  ok('credentialing specialist can get health/background but not source documents', !throws(() => S.createGrant(rec('CREDENTIALING', { categories: ['SENSITIVE_HEALTH', 'BACKGROUND'] }))) && throws(() => S.createGrant(rec('CREDENTIALING', { categories: ['SOURCE_DOCUMENTS'] }))));
  ok('compliance/auditor can get source documents', !throws(() => S.createGrant(rec('COMPLIANCE_AUDITOR', { categories: ['SOURCE_DOCUMENTS', 'LICENSES'] }))));
  ok('links need a recipient, a role and a purpose', throws(() => S.createGrant({ ...rec('RECRUITER'), recipient: { role: 'RECRUITER' } })) && throws(() => S.createGrant({ ...rec('RECRUITER'), purpose: '' })) && throws(() => S.createGrant({ ...rec('NURSE') })));
  // durations / expiry
  const exp = d => S.createGrant(rec('RECRUITER', { duration: d, contractEnd: '2026-12-31' }));
  ok('durations: 24h / 7d / 30d / contract / until revoked', exp('H24').expiresAt === '2026-10-17T12:00:00.000Z' && exp('D7').expiresAt === '2026-10-23T12:00:00.000Z' && exp('D30').expiresAt === '2026-11-15T12:00:00.000Z' && /^2026-12-31|^2027-01-01/.test(exp('CONTRACT').expiresAt) && exp('UNTIL_REVOKED').expiresAt === null);
  ok('contract duration without an end date is refused', throws(() => S.createGrant(rec('RECRUITER', { duration: 'CONTRACT' }))));
  let g = S.createGrant(rec('RECRUITER', { duration: 'H24' })), log = [];
  const viewer = { email: 'pat@hospital.example', role: 'RECRUITER' };
  let a = S.accessGrant(g, viewer, log, T0 + 3600e3);
  ok('active link opens for the bound recipient (case-insensitive email)', a.ok && a.grant.views === 1);
  ok('expired link refused after 24h and logged', (x => !x.ok && x.reason === 'EXPIRED' && x.log[x.log.length - 1].result === 'DENIED')(S.accessGrant(g, viewer, a.log, T0 + 25 * 3600e3)));
  ok('different person with the link is refused (recipient-bound)', S.accessGrant(g, { email: 'other@x.example', role: 'RECRUITER' }, [], T0).reason === 'NOT_THE_RECIPIENT');
  ok('same person claiming a higher role is refused', S.accessGrant(g, { email: 'pat@hospital.example', role: 'COMPLIANCE_AUDITOR' }, [], T0).reason === 'ROLE_MISMATCH');
  const one = S.createGrant(rec('RECRUITER', { duration: 'ONE_TIME' })); const o1 = S.accessGrant(one, viewer, [], T0);
  ok('one-time link: first view ok, second refused', o1.ok && S.accessGrant(o1.grant, viewer, o1.log, T0 + 1).reason === 'ONE_TIME_LINK_ALREADY_USED');
  const rv = S.revokeGrant(a.grant, T0 + 7200e3);
  ok('revoked link refused immediately', (x => !x.ok && x.reason === 'REVOKED')(S.accessGrant(rv, viewer, [], T0 + 7300e3)));
  ok('access log is append-only and frozen; no document contents', (() => { const l = a.log; try { l.push({}) } catch (_) {} return l.length === 1 && Object.isFrozen(l[0]) && !('document' in l[0]) })());
  // progressive disclosure
  const cred = S.createGrant(rec('CREDENTIALING', { categories: ['LICENSES', 'CERTIFICATIONS', 'SENSITIVE_HEALTH', 'BACKGROUND'] }));
  const v = S.buildRecipientView(P(), cred);
  const tb = v.items.find(i => i.id === 'tb');
  ok('sensitive health item: "requirement satisfied: YES" without exposing the document', tb.requirementSatisfied === 'YES' && tb.document === 'withheld' && tb.details === 'withheld');
  ok('source documents not shared without the SOURCE_DOCUMENTS category', v.items.find(i => i.id === 'lic-az').document === 'not shared');
  const rview = S.buildRecipientView(P(), S.createGrant(rec('RECRUITER')));
  ok('recruiter view never contains health or background items', !rview.items.some(i => ['tb', 'bg'].includes(i.id)));
  const aud = S.buildRecipientView(P(), S.createGrant(rec('COMPLIANCE_AUDITOR', { categories: ['LICENSES', 'SOURCE_DOCUMENTS'] })));
  ok('auditor with source documents sees the private document reference', aud.items[0].document.ref === 'private:lic');
  ok('verified states are flagged demo and the view carries a DEMO notice', v.items.filter(i => i.status === 'VERIFIED').every(i => i.demo) && /DEMO/.test(v.demoNotice));
  // assignment-specific
  const asg = S.buildRecipientView(P(), S.createGrant(rec('RECRUITER', { assignmentId: 'boston' })), { assignmentKinds: ['RN_LICENSE_MULTISTATE'] });
  ok('assignment-specific Passport shows only what that assignment requires', asg.items.length === 1 && asg.items[0].id === 'lic-az' && asg.assignmentId === 'boston');
  // snapshots
  const snap = await S.createSnapshot(P(), { now: T0, anchor: true });
  ok('snapshot = canonical JSON → sha256 → signature (DEMO key, labeled)', /^[0-9a-f]{64}$/.test(snap.sha256) && snap.sha256 === await S.sha256Hex(snap.canonicalJson) && snap.signature.demoKey === true && snap.signature.alg === 'HMAC-SHA256');
  ok('snapshot excludes sensitive categories; anchor ref is mocked', !snap.body.items.some(i => ['tb', 'bg'].includes(i.id)) && snap.anchor.mocked && !snap.anchor.anchored);
  ok('valid snapshot verifies as authentic and current', (await S.verifySnapshot(snap, P())).state === 'AUTHENTIC_CURRENT');
  const mod = JSON.parse(JSON.stringify(snap)); mod.body.items[0].expires = '2099-01-01';
  ok('modified snapshot fails (TAMPERED)', (await S.verifySnapshot(mod, P())).state === 'TAMPERED');
  const forged = JSON.parse(JSON.stringify(mod)); forged.sha256 = await S.sha256Hex(S.canon(forged.body));
  ok('re-hashed but unsigned modification fails on the signature', (r => r.state === 'TAMPERED' && /Signature/.test(r.reason))(await S.verifySnapshot(forged, P())));
  const p2 = P(); p2.items[1].version = 2;
  ok('stale snapshot: "One credential changed since this snapshot"', (r => r.state === 'OUTDATED' && r.reason === 'One credential changed since this snapshot' && r.changed[0].id === 'bls')(await S.verifySnapshot(snap, p2)));
  const p3 = P(); p3.items[0].status = 'REVOKED';
  ok('snapshot containing a revoked credential → REVOKED', (await S.verifySnapshot(snap, p3)).state === 'REVOKED');
  ok('revoked snapshot → REVOKED', (await S.verifySnapshot(snap, P(), { revokedSnapshots: [snap.sha256] })).state === 'REVOKED');
  const qr = S.qrPayload(snap, 'https://example.test/verify');
  ok('QR carries only the verification URL + hash prefix (no name, no credential data)', qr === 'https://example.test/verify?vsnap=' + snap.sha256.slice(0, 32) && !/Alex|Arizona|BLS|RN/.test(qr));
  // vault
  let vault = [];
  vault = await S.vaultAppend(vault, { credentialId: 'bls', version: 1, event: 'VERIFIED', source: 'AHA eCard (DEMO)', psv: { method: 'Simulated lookup' }, verifier: 'Demo verifier', at: '2025-11-01T00:00:00Z', evidenceRef: 'private:bls1' });
  vault = await S.vaultAppend(vault, { credentialId: 'bls', version: 2, event: 'RENEWED', source: 'AHA eCard (DEMO)', psv: { method: 'Simulated lookup' }, verifier: 'Demo verifier', at: '2026-10-01T00:00:00Z', supersedes: 1, evidenceRef: 'private:bls2' });
  ok('current vs superseded versions', S.vaultCurrent(vault).version === 2 && S.vaultVersionStatus(vault, 1) === 'SUPERSEDED' && S.vaultVersionStatus(vault, 2) === 'CURRENT');
  ok('every PSV record in the vault is labeled demo', vault.every(e => !e.psv || e.psv.demo === true));
  ok('vault hash chain verifies', (await S.vaultIntegrity(vault)).ok);
  const bad = vault.map(e => ({ ...e })); bad[0].verifier = 'someone else';
  ok('editing a past vault entry breaks integrity', !(await S.vaultIntegrity(bad)).ok);
  const vr = await S.vaultAppend(vault, { credentialId: 'bls', version: 3, event: 'REVOKE', revokes: 2, at: '2026-10-10T00:00:00Z' });
  ok('revocation is appended; version 2 shows REVOKED, nothing current', S.vaultVersionStatus(vr, 2) === 'REVOKED' && S.vaultCurrent(vr) === null && vr.length === 3);
  ok('vault evidence visible to auditor/nurse only', S.vaultViewFor(vault, 'RECRUITER')[0].evidenceRef === 'withheld' && S.vaultViewFor(vault, 'CREDENTIALING')[0].evidenceRef === 'withheld' && S.vaultViewFor(vault, 'COMPLIANCE_AUDITOR')[0].evidenceRef === 'private:bls1');
  // audit packet
  const gA = S.createGrant(rec('COMPLIANCE_AUDITOR', { assignmentId: 'boston', categories: ['LICENSES', 'CERTIFICATIONS', 'SOURCE_DOCUMENTS'] }));
  const gR = S.createGrant(rec('RECRUITER', { assignmentId: 'boston', categories: ['LICENSES', 'CERTIFICATIONS'] }));
  const pA = await S.generateAuditPacket(P(), { bls: vault }, gA, { now: T0 }), pR = await S.generateAuditPacket(P(), { bls: vault }, gR, { now: T0 });
  ok('audit packet generated per role: different contents and hashes', pA.sha256 !== pR.sha256 && pA.body.role === 'COMPLIANCE_AUDITOR' && pR.body.role === 'RECRUITER');
  ok('auditor packet includes vault history with evidence refs; recruiter packet withholds them', pA.body.entries.find(e => e.item.id === 'bls').history[0].evidenceRef === 'private:bls1' && pR.body.entries.find(e => e.item.id === 'bls').history[0].evidenceRef === 'withheld');
  const pB = await S.generateAuditPacket(P(), { bls: vault }, { ...gR, assignmentId: 'denver' }, { now: T0, assignmentKinds: ['CERT_BLS'] });
  ok('audit packet is per assignment (different assignment → different packet)', pB.sha256 !== pR.sha256 && pB.body.entries.length === 1);
  ok('audit packet signed with the labeled DEMO key and marked demo', pA.signature.demoKey && pA.body.demo === true);
  ok('ZK predicates are stubs only (not implemented)', S.zkPredicateStub('HAS_ACTIVE_RN_LICENSE_IN').implemented === false);
  const f = R.filter(l => l.startsWith('FAIL')).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
