#!/usr/bin/env node
/* v14.9 Education model tests (Munib t160u) + a browser check of the secondary panel. Offline; no DB; no model.
   Usage: node backend/tests/p149-education.js */
const D = require('../../js/education.js');
const fs = require('fs'), path = require('path');
const R = []; const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (!c && i !== '' ? ' — ' + JSON.stringify(i).slice(0, 300) : ''); R.push(l); console.log(l); return c; };
const throws = f => { try { f(); return false } catch (_) { return true } };
const asn = D.createEducation({ degreeType: 'ASN', institution: 'Phoenix College', gradDate: '2018', gpa: 3.9, coursework: ['x'] });
const bsn = D.createEducation({ degreeType: 'BSN', institution: 'ASU', gradDate: '2021' });
const psv = (r, deg) => D.appendEducationAttestation(r, { source: 'NSC (sim)', sourceType: 'NATIONAL_STUDENT_CLEARINGHOUSE', verifier: 'V', confirms: { institution: r.claim.institution, degreeType: deg || r.claim.degreeType, gradDate: r.claim.gradDate } });
ok('onboarding copy and actions exactly as specified', D.ONBOARDING_COPY.text === 'Add your nursing education. Verification may only be required if an employer or assignment requires a specific degree.' && D.ONBOARDING_COPY.actions.join('|') === 'Add education|Skip for now');
ok('degree list: Diploma, ASN/ADN, BSN, MSN, Other', Object.keys(D.DEGREES).join() === 'DIPLOMA,ASN,BSN,MSN,OTHER');
ok('unknown degree type rejected', throws(() => D.createEducation({ degreeType: 'PHD', institution: 'X' })));
ok('no upload required: a typed record is SELF-ATTESTED', D.educationState(asn) === 'SELF-ATTESTED');
ok('graduation date optional', D.educationState(D.createEducation({ degreeType: 'BSN', institution: 'X' })) === 'SELF-ATTESTED');
ok('GPA, coursework and transcripts are never stored', !/gpa|coursework|3\.9/i.test(JSON.stringify(asn)));
const up = D.attachDocument(bsn, { ref: 'private:abc' });
ok('upload → DOCUMENT-SUPPORTED, never verified', D.educationState(up) === 'DOCUMENT-SUPPORTED' && D.verifiedDegree(up) === null && D.educationFieldStatuses(up).degreeType.status === 'DOCUMENT-SUPPORTED');
ok('uploaded document is private and off-chain', up.documents[0].private === true && up.documents[0].onChain === false);
const v = psv(bsn);
ok('primary source (NSC) confirming institution + degree → PRIMARY-SOURCE VERIFIED', D.educationState(v) === 'PRIMARY-SOURCE VERIFIED' && D.verifiedDegree(v) === 'BSN');
ok('each field carries its own source', D.educationFieldStatuses(v).institution.sourceType === 'NATIONAL_STUDENT_CLEARINGHOUSE' && D.educationFieldStatuses(v).program.status === 'NOT PROVIDED');
const partial = D.appendEducationAttestation(bsn, { source: 'Registrar', sourceType: 'REGISTRAR', verifier: 'V', confirms: { institution: 'ASU' } });
ok('institution confirmed but not degree → field-level only; record not verified', D.educationFieldStatuses(partial).institution.status === 'PRIMARY-SOURCE VERIFIED' && D.educationFieldStatuses(partial).degreeType.status === 'SELF-ATTESTED' && D.educationState(partial) === 'SELF-ATTESTED');
ok('Nursys is never an education source', throws(() => D.appendEducationAttestation(bsn, { source: 'Nursys QuickConfirm', sourceType: 'REGISTRAR', confirms: { degreeType: 'BSN' } })) && throws(() => D.appendEducationAttestation(bsn, { source: 'x', sourceType: 'NURSYS', confirms: {} })));
ok('employment / certification / license sources rejected; unknown source types rejected', throws(() => D.appendEducationAttestation(bsn, { source: 'Employer HR', sourceType: 'REGISTRAR' })) && throws(() => D.appendEducationAttestation(bsn, { source: 'AHA certification', sourceType: 'REGISTRAR' })) && throws(() => D.appendEducationAttestation(bsn, { source: 'x', sourceType: 'NURSE_UPLOAD' })));
ok('history append-only and frozen; mock proof ref, not anchored', (() => { try { v.history[0].sourceType = 'X' } catch (_) {} return v.history[0].sourceType === 'NATIONAL_STUDENT_CLEARINGHOUSE' && v.history[0].proofRef.mocked && !v.history[0].proofRef.anchored && bsn.history.length === 0 })());
ok('anchor payload: no school, degree, name or dates', (p => !/ASU|BSN|2021|Phoenix/.test(JSON.stringify(p)))(D.educationAnchorPayload(v, v.history[0])));
const rv = D.revokeEducationAttestation(v, v.history[0].id);
ok('revocation appends and removes verification', rv.history.length === 2 && D.educationState(rv) === 'SELF-ATTESTED');
const ev = (recs, rule) => D.evaluateEducationRule(recs, rule);
// required scenarios
ok('no requirement → NOT_APPLICABLE, never blocks (even with no education)', ev([], null).result === 'NOT_APPLICABLE' && !ev([], null).blocks && ev([], { mode: 'NOT_REQUIRED', minDegree: 'BSN' }).result === 'NOT_APPLICABLE');
ok('ASN accepted: verified ASN → PASS', ev([psv(asn)], { mode: 'REQUIRED', minDegree: 'ASN' }).result === 'PASS');
ok('ASN accepted: verified BSN also PASS (higher degree)', ev([v], { mode: 'REQUIRED', minDegree: 'ASN' }).result === 'PASS');
ok('BSN required: self-attested BSN → PENDING EDUCATION VERIFICATION (blocks)', (r => r.result === 'PENDING_EDUCATION_VERIFICATION' && r.blocks)(ev([bsn], { mode: 'REQUIRED', minDegree: 'BSN' })));
ok('BSN required: document-supported BSN → still PENDING (upload is not verification)', ev([up], { mode: 'REQUIRED', minDegree: 'BSN' }).result === 'PENDING_EDUCATION_VERIFICATION');
ok('BSN required: verified BSN → PASS', ev([v], { mode: 'REQUIRED', minDegree: 'BSN' }).result === 'PASS');
ok('BSN required: only verified ASN → FAIL with reason', (r => r.result === 'FAIL' && /Requires BSN or higher; highest on file is ASN/.test(r.reason))(ev([psv(asn)], { mode: 'REQUIRED', minDegree: 'BSN' })));
ok('BSN required: no education → FAIL "no education on file"', /no education on file/.test(ev([], { mode: 'REQUIRED', minDegree: 'BSN' }).reason));
ok('BSN preferred: only ASN → QUALIFIED, preference not met, does not block', (r => r.result === 'QUALIFIED_PREFERENCE_NOT_MET' && !r.blocks)(ev([psv(asn)], { mode: 'PREFERRED', minDegree: 'BSN' })));
ok('BSN preferred: self-attested BSN → qualified, preference pending (no block)', (r => r.result === 'QUALIFIED_PREFERENCE_PENDING' && !r.blocks)(ev([bsn], { mode: 'PREFERRED', minDegree: 'BSN' })));
ok('BSN preferred: verified BSN → PASS', ev([v], { mode: 'PREFERRED', minDegree: 'BSN' }).result === 'PASS');
ok('self-attested vs verified differ for the same claim', ev([bsn], { mode: 'REQUIRED', minDegree: 'BSN' }).result !== ev([psv(bsn)], { mode: 'REQUIRED', minDegree: 'BSN' }).result);
ok('verified degree is the source value, not the claim (claim BSN, source says ASN → FAIL BSN rule)', ev([psv(bsn, 'ASN')], { mode: 'REQUIRED', minDegree: 'BSN' }).result !== 'PASS');

(async () => {
  const pw = require('playwright'), http = require('http'), root = path.resolve(__dirname, '../..');
  const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end() } s.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); s.end(d) }) });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(), pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.evaluate(() => { localStorage.removeItem('veridun_education_v1'); v81ShowRole('clinician'); showV7View('passportView'); });
  const o = await pg.evaluate(() => { const ids = [...document.querySelectorAll('#passportView [id]')].map(e => e.id); const rows = Object.fromEntries([...document.querySelectorAll('#eduRulesV149 tr[data-rule]')].map(r => [r.dataset.rule, r.dataset.result])); return { after: ids.indexOf('eduV149') > ids.indexOf('empExpV149') && ids.indexOf('empExpV149') > ids.indexOf('v7PassportSections'), collapsed: !document.getElementById('eduCardV149').open, rows, states: [...document.querySelectorAll('.edu-rec-v149')].map(e => e.dataset.state), txt: document.getElementById('eduCardV149').textContent }; });
  ok('[ui] education panel sits after license/certs and experience, collapsed by default (secondary)', o.after && o.collapsed, o);
  ok('[ui] onboarding copy with Add education / Skip for now', /Verification may only be required if an employer or assignment requires a specific degree/.test(o.txt) && /Add education/.test(o.txt) && /Skip for now/.test(o.txt));
  ok('[ui] demo: verified ASN + self-attested BSN', o.states.join() === 'PRIMARY-SOURCE VERIFIED,SELF-ATTESTED', o.states);
  ok('[ui] rule preview: none ignored, ASN PASS, BSN required pending, BSN preferred qualified-pending', o.rows.none === 'NOT_APPLICABLE' && o.rows.asn === 'PASS' && o.rows.bsnreq === 'PENDING_EDUCATION_VERIFICATION' && o.rows.bsnpref === 'QUALIFIED_PREFERENCE_PENDING', o.rows);
  await pg.click('#eduCardV149 summary'); await pg.click('#eduAddBtnV149'); await pg.selectOption('#eduDegV149', 'MSN'); await pg.fill('#eduSchoolV149', 'UCSF'); await pg.click('#eduSaveV149');
  ok('[ui] nurse adds MSN without upload → self-attested', await pg.evaluate(() => [...document.querySelectorAll('.edu-rec-v149')].some(e => /UCSF/.test(e.textContent) && e.dataset.state === 'SELF-ATTESTED')));
  if (process.env.SHOTS) await pg.locator('#eduCardV149').screenshot({ path: process.env.SHOTS + '/education.png' });
  ok('[ui] no page errors', errs.length === 0, errs);
  await b.close(); srv.close();
  const f = R.filter(l => l.startsWith('FAIL')).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
