#!/usr/bin/env node
/* v14.8 XRPL credential identity — unit tests for js/ledger-identity.js (Node, no browser, no network).
   semantic_type (e.g. RN_LICENSE) and ledger_credential_type (opaque, random, generated once per
   credential) are separate. The ledger id carries no holder name, license number, jurisdiction,
   DOB or other personal data, and readiness/policy code never reads it.
   Usage: node backend/tests/xrpl-id-test.js */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..');
const R = []; const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (!c && i ? ' — ' + i : ''); R.push(l); console.log(l); return c; };
let L = null;
try { L = require(path.join(root, 'js/ledger-identity.js')); } catch (e) { ok('js/ledger-identity.js loads', false, e.message.split('\n')[0]); }
const hex = s => Buffer.from(String(s), 'utf8').toString('hex').toUpperCase();
const unhex = h => Buffer.from(String(h), 'hex').toString('utf8');
if (L) {
  // 1. format, length, opacity
  const a = L.newId(), b = L.newId();
  ok('ledger id is opaque: vc1_ + 32 lowercase hex', /^vc1_[0-9a-f]{32}$/.test(a) && L.isValidId(a), a);
  ok('ledger id fits XRPL CredentialType (≤ 64 bytes → ≤ 128 hex chars)', hex(a).length <= 128 && hex(a).length % 2 === 0, hex(a).length);
  ok('two ids differ', a !== b);
  const many = new Set(); for (let i = 0; i < 20000; i++) many.add(L.newId());
  ok('20 000 generated ids are unique', many.size === 20000, many.size);
  ok('isValidId rejects semantic types, PII-looking strings and junk', ['RN_LICENSE', 'RN_LICENSE:US-CA', 'CERT_BLS', 'vc1_XYZ', 'vc1_' + 'g'.repeat(32), '', null, undefined, 'vc1_' + 'a'.repeat(31)].every(x => !L.isValidId(x)));
  ok('newId takes no credential input (cannot encode PII)', L.newId.length <= 1);
  // 2. ensure(): generated once, never regenerated, no PII
  const ca = { id: 1, kind: 'RN_LICENSE', type: 'RN_LICENSE:US-CA', jurisdiction: 'US-CA', holder: 'Testa Fakename', number: 'RN990011', dob: '1990-01-01' };
  const ma = { id: 2, kind: 'RN_LICENSE', type: 'RN_LICENSE:US-MA', jurisdiction: 'US-MA' };
  const all = [ca, ma];
  const idCa = L.ensure(ca, all), idCa2 = L.ensure(ca, all), idMa = L.ensure(ma, all);
  ok('ensure() generates once and is idempotent', idCa === idCa2 && ca.ledgerCredentialType === idCa && L.isValidId(idCa));
  ok('CA RN and MA RN get different ledger ids', idCa !== idMa);
  const twin = { ...ca, id: 99 }; delete twin.ledgerCredentialType; const idTwin = L.ensure(twin, [ca, twin]);
  ok('ledger ids carry no semantic type, jurisdiction, name, number or DOB (pure random: identical PII → different ids)', [idCa, idMa, idTwin].every(x => /^vc1_[0-9a-f]{32}$/.test(x) && !/LICENSE|US-|TESTA|FAKENAME|990011|1990-01-01/i.test(x)) && idTwin !== idCa);
  ok('ensure() records proof schema version and creation time, not the semantic type', ca.ledgerProofSchema === 'veridun.xrpl-credential.v1' && !!ca.ledgerIdCreatedAt && !String(ca.ledgerCredentialType).includes('RN'));
  // 3. collision: a stubbed generator returning a taken id is retried
  const fixed = ['vc1_' + 'a'.repeat(32), 'vc1_' + 'a'.repeat(32), 'vc1_' + 'b'.repeat(32)]; let k = 0;
  const x1 = { id: 10, kind: 'CERT_BLS', type: 'CERT_BLS' }, x2 = { id: 11, kind: 'CERT_BLS', type: 'CERT_BLS' }, pool = [x1, x2];
  L.ensure(x1, pool, () => fixed[k++]); L.ensure(x2, pool, () => fixed[k++]);
  ok('colliding generated id is regenerated (two BLS generations stay distinct)', x1.ledgerCredentialType === fixed[0] && x2.ledgerCredentialType === fixed[2], JSON.stringify([x1.ledgerCredentialType, x2.ledgerCredentialType]));
  // a copied record that already holds another credential's id, never issued → gets its own id
  const y1 = { id: 20, kind: 'CERT_ACLS', type: 'CERT_ACLS', ledgerCredentialType: 'vc1_' + 'c'.repeat(32), chain: 'ACCEPTED', issueTx: 'T1' };
  const y2 = { id: 21, kind: 'CERT_ACLS', type: 'CERT_ACLS', ledgerCredentialType: 'vc1_' + 'c'.repeat(32), chain: 'NOT ISSUED' };
  ok('collisionWith() finds another credential holding the same ledger id', L.collisionWith(y2, [y1, y2]) === y1);
  const r2 = L.ensure(y2, [y1, y2]);
  ok('an unissued copy that collides is given a fresh id; the issued one keeps its id', r2 !== y1.ledgerCredentialType && L.isValidId(r2) && y1.ledgerCredentialType === 'vc1_' + 'c'.repeat(32));
  const y3 = { id: 22, kind: 'CERT_ACLS', type: 'CERT_ACLS', ledgerCredentialType: 'vc1_' + 'c'.repeat(32), chain: 'ACCEPTED', issueTx: 'T2' };
  let threw = false; try { L.ensure(y3, [y1, y3]); } catch (e) { threw = /collision/i.test(e.message); }
  ok('two already-issued credentials with one id → refuses (never silently re-points a proof)', threw);
  // 4. legacy proofs
  const leg = { id: 30, kind: 'CERT_ACLS', type: 'CERT_ACLS', chain: 'ACCEPTED', issuer: 'rI', subject: 'rS', acceptTx: 'TX' };
  ok('a proof issued before v14.8 (no ledger id) is legacy', L.isLegacyProof(leg) && !L.isLegacyProof({ chain: 'NOT ISSUED' }) && !L.isLegacyProof(ca));
  ok('legacy proof keeps its original CredentialType (semantic code) for lookup and accept', L.proofTypeString(leg) === 'CERT_ACLS');
  ok('new proof uses the ledger id as CredentialType', L.proofTypeString(ca) === idCa);
  let threwLeg = false; try { L.ensure(leg, [leg]); } catch (e) { threwLeg = true; }
  ok('ensure() does not re-key a legacy proof that is on the ledger', threwLeg || !leg.ledgerCredentialType);
  // 5. semantic type
  ok('semanticType() is the catalog kind (RN_LICENSE), not the jurisdiction code', L.semanticType(ca) === 'RN_LICENSE' && L.semanticType({ type: 'RN_LICENSE:US-TX' }) === 'RN_LICENSE' && L.semanticType({ kind: 'CERT_BLS', type: 'CERT_BLS' }) === 'CERT_BLS');
  // 6. passport entries
  Object.assign(ca, { name: 'California RN License', chain: 'ACCEPTED', acceptTx: 'ATX', acceptLedger: 77, expiration: '2029-01-31', prov: { source: 'CA BRN (demo)', verifiedAt: '2026-01-01T00:00:00Z' } });
  const ren = { id: 3, kind: 'RN_LICENSE', type: 'RN_LICENSE:US-CA', renews: 1, chain: 'ACCEPTED', name: 'California RN License' }; L.ensure(ren, [ca, ma, ren]);
  ok('a renewal records the ledger id it supersedes (link, separate generation)', ren.ledgerSupersedes === idCa && ren.ledgerCredentialType !== idCa, JSON.stringify(ren));
  const e1 = L.passportEntry(ca), e2 = L.passportEntry(leg), e3 = L.passportEntry(ren);
  ok('passport entry stores semantic type and ledger id separately', e1.st === 'RN_LICENSE' && e1.l === idCa && e1.t === 'RN_LICENSE:US-CA' && !('lg' in e1), JSON.stringify(e1));
  ok('passport entry records network, proof schema, tx hash and ledger index', e1.net === 'XRPL_DEVNET' && e1.ps === 'veridun.xrpl-credential.v1' && e1.tx === 'ATX' && String(e1.li) === '77', JSON.stringify(e1));
  ok('legacy passport entry has no ledger id and is labelled legacy', !e2.l && e2.lg === 1 && e2.t === 'CERT_ACLS', JSON.stringify(e2));
  ok('renewal passport entry links the superseded proof', e3.sp === idCa, JSON.stringify(e3));
  // 7. public lookup
  ok('lookup uses the ledger id when present', JSON.stringify(L.lookupFor(e1)) === JSON.stringify({ mode: 'LEDGER_ID', str: idCa }));
  ok('lookup falls back to the semantic code only for legacy entries', L.lookupFor(e2).mode === 'LEGACY' && L.lookupFor(e2).str === 'CERT_ACLS' && L.lookupFor({ t: 'CERT_BLS', n: 'BLS' }).mode === 'LEGACY');
  ok('a malformed ledger id is INVALID, never downgraded to a legacy lookup', L.lookupFor({ t: 'CERT_BLS', l: 'CERT_BLS' }).mode === 'INVALID' && L.lookupFor({ t: 'CERT_BLS', l: 'vc1_zz' }).mode === 'INVALID');
  // 8. DOM ids
  const d1 = L.domId('pubProof', 0, e1), d2 = L.domId('pubProof', 1, e2), d3 = L.domId('pubProof', 2, { t: 'CERT_BLS', l: 'vc1_' + 'd'.repeat(32) });
  ok('DOM ids are unique, HTML-safe and never contain the semantic type', new Set([d1, d2, d3]).size === 3 && [d1, d2, d3].every(d => /^[A-Za-z][A-Za-z0-9_-]*$/.test(d) && !/RN_LICENSE|CERT_|:/.test(d)), JSON.stringify([d1, d2, d3]));
}
// 9. readiness/policy code never reads the ledger id (Sentinel role: readiness unchanged)
const readinessFiles = ['js/readiness-engine.js', 'js/requirements.js', 'js/assignments.js'];
ok('readiness/policy files never read ledgerCredentialType / ledger ids', readinessFiles.every(f => !/ledgerCredentialType|ledgerSupersedes|LedgerIdentity/.test(fs.readFileSync(path.join(root, f), 'utf8'))));
// 10. XRPL code never uses the semantic type as the CredentialType for new proofs
const xr = fs.readFileSync(path.join(root, 'js/xrpl.js'), 'utf8');
ok('xrpl.js no longer builds CredentialType from c.type', !/CredentialType:\s*xrpl\.convertStringToHex\(c\.type\)/.test(xr));
ok('xrpl.js no longer builds DOM ids from the semantic type (p_${x.t})', !/id="p_\$\{ec\(x\.t\)\}"/.test(xr) && !/\$\('p_'\+x\.t\)/.test(xr));
ok('proof URI no longer carries the semantic type', !/\?proof='\+encodeURIComponent\(c\.type\)/.test(xr));
ok('index.html loads js/ledger-identity.js before js/xrpl.js', (() => { const h = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); const i = h.indexOf('js/ledger-identity.js'), j = h.indexOf('js/xrpl.js'); return i > 0 && i < j; })());
const f = R.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${R.length - f}/${R.length} passed`);
process.exit(f ? 1 : 0);
