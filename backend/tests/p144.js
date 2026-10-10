/* v14.4: state RN licenses — issuing-state detection, fillable-form PDFs, thin text layers.
   A  parser units (Node): state from board / government wording, never from a street
      ("Washington St."), a city ("Washington, DC"), a mailing address or a bare 2-letter
      code; the name printed after "issues the license of Registered Nurse:"; a second copy
      of the expiration date is not an issue date; multistate never invented; mismatch text.
   B  synthetic documents (p144-fixtures.js) read on-device in headless Chrome: an AcroForm
      license PDF (values only in form fields), a flattened scan with a thin text layer
      (falls back to OCR), PNGs, and five other state layouts.
   C  wording: "primary state of residence", not "home state", in the compact explanations.
   Run: BASE=http://localhost:8765/ node backend/tests/p144.js */
const fs = require('fs');
const path = require('path');
const EXPOK = () => { const r = document.getElementById('acctExpDateRowV10'), cb = document.getElementById('acctExpOkV147'); if (r && cb && !r.classList.contains('hidden') && !expConfirmValid('acct')) cb.click(); }; /* v14.7: the nurse confirms the expiration */
const BASE = process.env.BASE || 'http://localhost:8765/';
const R = [];
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null ? ' — ' + String(i).slice(0, 300) : ''); R.push(l); console.log(l); };

function partA() {
  global.CREDENTIAL_CATALOG = global.CREDENTIAL_CATALOG || [];
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'credential-catalog.js'), 'utf8');
  const lit = /const US_JURISDICTIONS=(\[[\s\S]*?\n\]\.map\([^\n]*\);)/.exec(src)[1];
  const J = new Function('return ' + lit.replace(/;$/, ''))();
  const D = require('../../js/doc-extract.js');
  const P = t => D.parseCardText(t, { kind: 'RN_LICENSE', jurisdictions: J });
  const st = t => { const f = P(t).fields.jurisdiction; return f ? f.value : null; };
  const { MA, FOOTER } = require('./p144-fixtures.js');
  const maText = ['NOT A REAL CREDENTIAL - SYNTHETIC TEST DOCUMENT', 'THE COMMONWEALTH OF MASSACHUSETTS', 'DEPARTMENT OF PUBLIC HEALTH', 'Registered Nurse License',
    'The Board of Registration in Nursing, in accordance with the provision of', 'Massachusetts General Laws, issues the license of Registered Nurse:', MA.name, 'License Number: ' + MA.number,
    'Example Director, BSN RN', 'Executive Director, Board of Registration in Nursing', 'Expiration Date: ' + MA.exp, 'THE COMMONWEALTH OF MASSACHUSETTS', MA.name, MA.street, MA.city, 'License #: ' + MA.number, 'Expiration Date: ' + MA.exp, ...FOOTER].join('\n');
  const r = P(maText), v = k => r.fields[k] && r.fields[k].value;
  ok('A1 MA form text: state MA from "Commonwealth of Massachusetts" (not WA from "Washington St.")', v('jurisdiction') === 'US-MA' && r.fields.jurisdiction.how === 'issuing board', JSON.stringify(r.fields.jurisdiction));
  ok('A2 MA: name read after "issues the license of Registered Nurse:"', v('holder_name') === MA.name, v('holder_name'));
  ok('A3 MA: license number + expiration date', v('credential_id') === MA.number && v('expires_on') === MA.expIso, JSON.stringify([v('credential_id'), v('expires_on')]));
  ok('A4 MA: the second copy of the expiration date is not taken as the issue date', !r.fields.issued_on, JSON.stringify(r.fields.issued_on));
  ok('A5 MA: multistate not invented; a note explains MA licenses cover MA only', !r.fields.multistate && /Massachusetts can't issue multistate/.test(r.notes.multistate || ''), r.notes.multistate);
  const cmp = D.compareToEntered({ jurisdiction: 'US-MA' }, { kind: 'RN_LICENSE', jurisdiction: 'US-ME' }).find(x => x.field === 'jurisdiction');
  ok('A6 mismatch text names MA (document) vs ME (selected)', cmp && /from MA, but you selected ME/.test(cmp.text), cmp && cmp.text);
  ok('A7 the footer alone ("999 Washington St., Example City, MA") gives no state', st(FOOTER.join('\n')) === null, st(FOOTER.join('\n')));
  ok('A8 "Washington, DC" and "George Washington University" are not Washington State', st('Registered Nurse\nGraduate of George Washington University\nWashington, DC 20001') === null, st('Registered Nurse\nGraduate of George Washington University\nWashington, DC 20001'));
  ok('A9 bare 2-letter codes never decide the state ("Portland, ME 04101", "Boston, MA")', st('Registered Nurse License\nLicense Number: RN123456\n12 Main St\nPortland, ME 04101\nBoston, MA') === null);
  ok('A10 "State of Washington Department of Health" → WA', st('STATE OF WASHINGTON\nDEPARTMENT OF HEALTH\nRegistered Nurse') === 'US-WA');
  ok('A11 "West Virginia Board of Registered Nurses" → WV, not VA', st('West Virginia Board of Registered Nurses\nRegistered Nurse') === 'US-WV', st('West Virginia Board of Registered Nurses\nRegistered Nurse'));
  ok('A12 board wording wins over a licensee mailing address in another state', st('Texas Board of Nursing\nRegistered Nurse\n78 Maine Street, Augusta, ME 04330') === 'US-TX' && st('Florida Board of Nursing\n9 Virginia Rd, Arlington, VA 22000') === 'US-FL');
  ok('A13 "The University of the State of New York" → NY; "California Board of Registered Nursing" → CA', st('THE UNIVERSITY OF THE STATE OF NEW YORK\nRegistered Professional Nurse') === 'US-NY' && st('California Board of Registered Nursing') === 'US-CA');
  const weakOne = P('Registered Nurse License\nIssued in Oregon\nLicense Number: RN555');
  ok('A14 a lone state name with no board wording is only a weak hint (≤80%)', weakOne.fields.jurisdiction && weakOne.fields.jurisdiction.value === 'US-OR' && weakOne.fields.jurisdiction.conf <= 0.8, JSON.stringify(weakOne.fields.jurisdiction));
  const tx = P('Texas Board of Nursing\nRegistered Nurse - Multistate License\nLicense Number: 000123456');
  ok('A15 multistate only when printed ("Multistate License" → multistate)', tx.fields.multistate && tx.fields.multistate.value === 'multistate');
}

async function partB(browser) {
  const { generate } = require('./p144-fixtures.js');
  const cases = await generate(browser);
  const pg = await browser.newPage();
  await pg.goto(BASE, { waitUntil: 'networkidle2' });
  for (const c of cases) {
    if (process.env.ONLY && !c.id.includes(process.env.ONLY)) continue;
    const r = await pg.evaluate(async (b64, name, mime) => {
      const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const res = await DocExtract.extractFromFile(new File([bin], name, { type: mime }), { kind: /^nihss/.test(name) ? 'CERT_NIHSS' : 'RN_LICENSE', profileName: '' });
      const vals = Object.fromEntries(Object.entries(res.fields).map(([k, x]) => [k, x.value]));
      const cmp = DocExtract.compareToEntered(vals, { kind: 'RN_LICENSE', jurisdiction: 'US-ME' }).find(x => x.field === 'jurisdiction');
      const ex = DocExtract.documentExpiry(res.fields, res.issuer);
      return { m: res.method, thin: !!res.textLayerThin, notes: res.notes, cmp: cmp && cmp.text, src: res.source && res.source.id, expired: !!(ex && ex.expired), f: Object.fromEntries(Object.entries(res.fields).map(([k, x]) => [k, { v: x.value, c: +x.conf.toFixed(2) }])) };
    }, fs.readFileSync(c.file).toString('base64'), c.id, c.mime);
    const got = k => r.f[k] && r.f[k].v;
    if (c.nihss) {
      const n = c.nihss, wrongN = Object.keys(c.truth).filter(k => (got(k) || null) !== c.truth[k]);
      const idConf = r.f.credential_id && r.f.credential_id.c;
      const decoy = !/QX-0101|AB-12/.test(JSON.stringify(r.f));
      const grp = (got('test_group') || null) === n.group, mod = (got('nihss_module') || null) === (n.module || null);
      const src = (r.src || null) === n.source && (n.source || /undetermined/.test((r.notes && r.notes.verifier) || ''));
      const exp = n.truth.expires_on ? r.expired === !!n.expired : (!r.f.expires_on && /No expiration printed/.test((r.notes && r.notes.expires_on) || ''));
      ok(`B ${c.id.padEnd(24)} ${c.method}: NIHSS fields, cert # by its label (not the footer code), group ${n.group || 'none'}, module ${n.module || 'none'}, verifier ${n.source || 'undetermined'}, ${n.truth.expires_on ? 'printed expiration → expired' : 'no expiration invented'}`,
        !wrongN.length && decoy && grp && mod && src && exp && r.m === c.method, JSON.stringify({ wrong: wrongN.map(k => [k, got(k)]), idConf, src: r.src, notes: r.notes, f: r.f, expired: r.expired }));
      continue;
    }
    /* OCR variants: a misread is acceptable only when it is flagged for checking (<70%) */
    const wrong = Object.keys(c.truth).filter(k => (got(k) || null) !== c.truth[k] && !(c.method !== 'PDF_TEXT' && r.f[k] && r.f[k].c < 0.7));
    const extra = (c.noIssue && r.f.issued_on) || (c.noMulti && r.f.multistate);
    const st = c.truth.jurisdiction.replace('US-', '');
    const cmpOk = st === 'ME' || (r.cmp && r.cmp.includes(`from ${st}, but you selected ME`));
    ok(`B ${c.id.padEnd(24)} ${c.method}: ${Object.keys(c.truth).join(', ')} right${c.method !== 'PDF_TEXT' ? ' (or flagged <70%)' : ''}; mismatch names ${st}`, !wrong.length && !extra && r.m === c.method && cmpOk,
      JSON.stringify({ m: r.m, wrong: wrong.map(k => [k, got(k)]), f: r.f, thin: r.thin }));
  }
  await pg.close();
}

function partD() {
  global.CREDENTIAL_CATALOG = global.CREDENTIAL_CATALOG || [];
  const D = require('../../js/doc-extract.js');
  const P = t => D.parseCardText(t, { kind: 'CERT_NIHSS', catalog: [{ kind: 'CERT_NIHSS', short: 'NIHSS', label: 'NIHSS — Stroke Scale', category: 'Certifications', privacy: 'SHAREABLE' }], sources: [] });
  const aha = P('Certificate\nof Completion\nTesta Fakename\nhas successfully completed\nNIH Stroke Scale – Test Group C\nIPA24Z9QbXY00001   Mar 7, 2024\nCertificate Number   Date Completed\nQX-0101 PART1 9/19 © 2019 American Heart Association');
  const v = k => aha.fields[k] && aha.fields[k].value;
  ok('D1 value-above-label: certificate number = IPA-style value, never the footer code QX-0101', v('credential_id') === 'IPA24Z9QbXY00001', v('credential_id'));
  ok('D2 AHA/ASA printed → verifier aha-asa-nihss; group C as printed; no expiration invented', aha.source && aha.source.id === 'aha-asa-nihss' && v('test_group') === 'C' && !aha.fields.expires_on && !aha.fields.nihss_module, JSON.stringify([aha.source, v('test_group')]));
  const only = P('NIH Stroke Scale\nTesta Fakename\nQX-0101 PART1 9/19');
  ok('D3 an unlabelled form code is not reported as a high-confidence certificate number', !only.fields.credential_id || only.fields.credential_id.conf < 0.9, JSON.stringify(only.fields.credential_id));
  const none = P('Certificate of Completion\nRiley Testperson\nNIH Stroke Scale\nCertificate ID: NX55500012\nDate Completed: 06/02/2025');
  ok('D4 no issuer printed → no verifier chosen, "undetermined" note (never Apex by default)', !none.source && /undetermined/.test(none.notes.verifier || ''), JSON.stringify([none.source, none.notes.verifier]));
  const both = D.nihssIssuer('Apex Innovations\nAmerican Heart Association');
  ok('D5 two different issuers printed → ambiguous, undetermined', !both.id && both.ambiguous);
  ok('D6 Apex / NIHSS+ / NIH Stroke Scale International map to their registry ids', D.nihssIssuer('Apex Innovations').id === 'apex-nihss' && D.nihssIssuer('NIHSS+ certificate').id === 'nihss-plus' && D.nihssIssuer('NIH Stroke Scale International').id === 'nihss-international');
  const rec = P('NIHSS Recertification Module\nPatient Group: D\nTesta Fakename\nCertificate Number: IPA25AB12CD34EF\nDate Completed: 02/01/2025');
  ok('D7 module (recertification) and group D captured as printed', rec.fields.nihss_module && rec.fields.nihss_module.value === 'recertification' && rec.fields.test_group.value === 'D' && !rec.found.includes('test_group'), JSON.stringify([rec.fields.nihss_module, rec.fields.test_group]));
  // requirement rules (readiness-engine)
  const vm = require('vm'); const ctx = { fd: d => d, credExpiry: c => c.expiration || '' }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'readiness-engine.js'), 'utf8').replace(/function evaluateRequirement[\s\S]*$/, '') + ';this.evaluateNihss=evaluateNihss;this.nihssRuleFor=nihssRuleFor;', ctx);
  const E = (req, c, a = { end: '2025-02-01' }, list = [c]) => ctx.evaluateNihss(req, c, a, list);
  const cA = { kind: 'CERT_NIHSS', completed: '2024-03-07', testGroup: 'A', nihssModule: 'initial', issuerId: 'aha-asa-nihss' };
  const r12 = E({ nihss: { withinMonths: 12, setBy: 'Example Hospital' } }, cA);
  ok('D8 facility 12-month rule: "meets the 12-month rule until 2025-03-07" (status, not an expiration)', r12.status === 'MET' && /12-month rule \(Example Hospital\) until 2025-03-07/.test(r12.basis) && cA.expiration === undefined, r12.basis);
  const r12late = E({ nihss: { withinMonths: 12 } }, cA, { end: '2025-12-01' });
  ok('D9 assignment ends after the 12-month window → outside window', r12late.status === 'OUTSIDE_WINDOW', r12late.note);
  const table = { nihss: { rules: [{ module: 'initial', months: 12 }, { module: 'recertification', months: 24 }], setBy: 'Example Hospital' } };
  const cR = { ...cA, testGroup: 'C', nihssModule: 'recertification', completed: '2024-03-07' };
  ok('D10 rule table by module: initial → 12 months, recertification → 24 months', /12-month initial-certification rule/.test(E(table, cA).basis) && /24-month recertification-certification rule|24-month recertification/.test(E(table, cR, { end: '2026-01-01' }).basis), JSON.stringify([E(table, cA).basis, E(table, cR, { end: '2026-01-01' }).basis]));
  const noMod = E(table, { ...cA, nihssModule: null });
  ok('D11 module not printed + module-keyed rule → needs review (never assumed)', noMod.status === 'NEEDS_REVIEW' && /module/.test(noMod.note), noMod.note);
  const groupTable = { nihss: { rules: [{ group: 'A', months: 12 }, { months: 24 }] } };
  ok('D12 facility override has priority over the issuer default (Group A → 12, other groups → 24)', E(groupTable, cR, { end: '2026-01-01' }).status === 'MET' && E(groupTable, cA, { end: '2025-12-01' }).status === 'OUTSIDE_WINDOW');
  const def = E({}, cR, { end: '2025-02-01' });
  ok('D13 no facility rule: AHA/ASA certificate uses the issuer-stated 12-month window (public AHA source)', def.status === 'MET' && /AHA\/ASA 12-month/.test(def.basis), def.basis);
  const und = E({}, { ...cR, issuerId: 'apex-nihss' });
  ok('D14 no facility rule and no confirmed issuer default → needs review, window undetermined', und.status === 'NEEDS_REVIEW' && /undetermined/.test(und.note), und.note);
  ok('D15 accepted groups: missing group → review; Group F not in B–E → not accepted', E({ nihss: { withinMonths: 24, acceptedGroups: ['B', 'C', 'D', 'E'] } }, { ...cR, testGroup: null }).status === 'NEEDS_REVIEW' && E({ nihss: { withinMonths: 24, acceptedGroups: ['B', 'C', 'D', 'E'] } }, { ...cR, testGroup: 'F' }).status === 'GROUP_NOT_ACCEPTED');
  const prev = { kind: 'CERT_NIHSS', completed: '2023-08-01', testGroup: 'C' };
  ok('D16 "different group than the previous certificate": same group → not accepted; different → met', E({ nihss: { withinMonths: 24, differentGroup: true } }, cR, { end: '2025-02-01' }, [prev, cR]).status === 'GROUP_NOT_ACCEPTED' && E({ nihss: { withinMonths: 24, differentGroup: true } }, { ...cR, testGroup: 'D' }, { end: '2025-02-01' }, [prev, { ...cR, testGroup: 'D' }]).status === 'MET');
  const sg = aha.calculated && aha.calculated.suggested_renewal;
  ok('D18 calculated renewal: 12 months from completion, labelled calculated/not printed, kept out of the expiration field and the logged fields', sg && sg.value === '2025-03-07' && sg.calculated && !aha.fields.expires_on && !aha.fields.suggested_renewal && !aha.found.includes('suggested_renewal') && D.FIELD_LABEL.suggested_renewal === 'Suggested renewal (calculated, not printed)', JSON.stringify(sg));
  ok('D19 undetermined window still offers a suggested renewal, clearly marked calculated', /Suggested renewal: 2025-03-07 \(calculated, not printed/.test(und.note || ''), und.note);
  ok('D20 facility 24-month rule: the requirement date is the facility date, marked calculated (not printed)', /24-month rule \(Example Hospital\) until 2026-03-07 \(requirement date, calculated from completion; not printed\)/.test(E({ nihss: { withinMonths: 24, setBy: 'Example Hospital' } }, cR, { end: '2026-01-01' }).basis || ''));
  const lic = D.parseCardText('THE COMMONWEALTH OF MASSACHUSETTS\nRegistered Nurse License\nLicense Number: RN0000099', { kind: 'RN_LICENSE' });
  ok('D21 license type read as printed (Registered Nurse → RN)', lic.fields.course && lic.fields.course.value === 'RN', JSON.stringify(lic.fields.course));
  const noDate = E({ nihss: { withinMonths: 12 } }, { ...cA, completed: null });
  ok('D17 no completion date → needs review', noDate.status === 'NEEDS_REVIEW');
}

/* E  v14.4 experience + skills checklists: calculated dates, never an expiration (browser page globals). */
async function partE(browser) {
  const pg = await browser.newPage();
  await pg.goto(BASE, { waitUntil: 'networkidle2' });
  const r = await pg.evaluate(() => {
    const out = {};
    out.recent = experienceRecentUntil('2025-01-15', 24); out.recent12 = experienceRecentUntil('2025-01-15', 12); out.redo = skillsRedoBy('2025-01-15');
    const c = { kind: 'SKILLS_ICU', completed: '2025-01-15', primary: 'VERIFIED', prov: { active: true } };
    out.def = evaluateSkills({ kind: 'SKILLS_ICU' }, c, { start: '2025-06-01' });
    out.late = evaluateSkills({ kind: 'SKILLS_ICU' }, c, { start: '2026-03-01' });
    out.f24 = evaluateSkills({ kind: 'SKILLS_ICU', skills: { months: 24, setBy: 'Example Hospital' } }, c, { start: '2026-03-01' });
    out.per = evaluateSkills({ kind: 'SKILLS_ICU', skills: { perAssignment: true, setBy: 'Example Hospital' } }, c, { id: 'x', start: '2025-06-01' });
    out.perOk = evaluateSkills({ kind: 'SKILLS_ICU', skills: { perAssignment: true } }, { ...c, forAssignment: 'x' }, { id: 'x', start: '2025-06-01' });
    out.none = evaluateSkills({ kind: 'SKILLS_ICU' }, { ...c, completed: null }, { start: '2025-06-01' });
    out.badge = verificationBadge(c);
    out.calcExp = calcDatesText({ kind: 'EMP_ICU_VERIFIED', lastWorked: '2025-01-15' });
    out.calcSk = calcDatesText(c);
    // demo seed: checklists carry a completion date and no expiration
    const seed = demoSeedCredentials().filter(x => /^SKILLS_/.test(x.kind));
    out.seed = seed.map(x => [x.expiration, x.completed]);
    // demo add form
    $('kindSearchV82').value = catalogKind('SKILLS_ICU').label; v81SyncAddForm();
    out.demoSkills = [$('dtRowV144').classList.contains('hidden'), !$('skillsRowV144').classList.contains('hidden'), $('skillsNoteV144').textContent];
    $('kindSearchV82').value = catalogKind('EMP_ICU_VERIFIED').label; v81SyncAddForm();
    out.demoExp = $('dtRowV144').classList.contains('hidden');
    $('kindSearchV82').value = catalogKind('CERT_BLS').label; v81SyncAddForm();
    out.demoBls = !$('dtRowV144').classList.contains('hidden');
    // account add form
    const host = document.createElement('div'); host.id = 'p144acct'; document.body.appendChild(host); host.innerHTML = acctAddForm();
    $('acctKindV10').value = 'SKILLS_ICU'; try { acctSyncAddForm(); } catch (e) { out.syncErr = e.message; }
    $('acctSkillsDoneV144').value = '2025-01-15'; acctCalcNotes();
    out.acctSkills = [$('acctExpDateRowV10').classList.contains('hidden'), !$('acctSkillsRowV144').classList.contains('hidden'), $('acctSkillsCalcV144').textContent, $('acctSkillsRowV144').textContent];
    $('acctKindV10').value = 'EMP_ICU_VERIFIED'; try { acctSyncAddForm(); } catch (e) { out.syncErr2 = e.message; }
    $('acctExpLastV10').value = '2025-01-15'; acctCalcNotes();
    out.acctExp = [$('acctExpDateRowV10').classList.contains('hidden'), $('acctExpCalcV144').textContent];
    $('acctKindV10').value = 'CERT_BLS'; try { acctSyncAddForm(); } catch (e) {}
    out.acctBls = !$('acctExpDateRowV10').classList.contains('hidden');
    /* v14.8: E14 retired — the reader's scan box (scanBoxHtml) no longer exists; see LEGACY_TEST_MAP.md */
    out.req = layeredRequirements({ id: 't', jurisdiction: 'US-CA', workType: 'TRAVEL_RN', specialties: ['ICU'], facility: 'Example Hospital', overrides: { skills: { perAssignment: true } } }, 'ICU').find(x => /^SKILLS_/.test(x.kind));
    return out;
  });
  ok('E1 experience counts as recent until last worked + 24 months (facility window configurable)', r.recent === '2027-01-15' && r.recent12 === '2026-01-15', JSON.stringify([r.recent, r.recent12]));
  ok('E2 skills checklist: suggested redo 12 months after completion', r.redo === '2026-01-15', r.redo);
  ok('E3 default 12-month checklist rule: met before, outside window after; labelled calculated + self-attested', r.def.status === 'MET' && /suggested redo by .*\(calculated/.test(r.def.basis) && /self-attested/.test(r.def.basis) && r.late.status === 'OUTSIDE_WINDOW', JSON.stringify([r.def, r.late]));
  ok('E4 facility 24-month checklist rule is final', r.f24.status === 'MET' && /24-month rule \(Example Hospital\)/.test(r.f24.basis), JSON.stringify(r.f24));
  ok('E5 per-assignment rule: an older checklist needs a new one for this assignment; one done for it is met', r.per.status === 'NEEDS_REVIEW' && /each assignment/.test(r.per.note) && r.perOk.status === 'MET', JSON.stringify([r.per, r.perOk]));
  ok('E6 no completion date → needs review', r.none.status === 'NEEDS_REVIEW');
  ok('E7 checklists are never shown as verified', /SELF-ATTESTED · NOT VERIFIED/.test(r.badge.text) && r.badge.cls !== 'VERIFIED', JSON.stringify(r.badge));
  ok('E8 summary text: "counts as recent until … (calculated)" / "suggested redo by … (calculated) · self-attested"', /counts as recent until Jan 15, 2027 \(calculated\)/.test(r.calcExp) && /completed Jan 15, 2025 · suggested redo by Jan 15, 2026 \(calculated\) · self-attested/.test(r.calcSk), JSON.stringify([r.calcExp, r.calcSk]));
  ok('E9 demo seed: skills checklists have a completion date and no expiration', r.seed.length > 0 && r.seed.every(([e, c]) => !e && /^\d{4}-\d\d-\d\d$/.test(c || '')), JSON.stringify(r.seed));
  ok('E10 demo add form: no expiration box for checklists (Completed on + vendor/self-attested note) or experience; kept for BLS', r.demoSkills[0] && r.demoSkills[1] && /self-attested/.test(r.demoSkills[2]) && /never shown as verified/.test(r.demoSkills[2]) && r.demoExp && r.demoBls, JSON.stringify(r.demoSkills));
  ok('E11 account form: checklist → Completed on + "Suggested redo by … CALCULATED" + agency/vendor note; no expiration box', !r.syncErr && r.acctSkills[0] && r.acctSkills[1] && /Suggested redo by/.test(r.acctSkills[2]) && /CALCULATED/.test(r.acctSkills[2]) && /agency or facility/.test(r.acctSkills[3]) && /never shows them as verified/.test(r.acctSkills[3]), JSON.stringify([r.syncErr, r.acctSkills]));
  ok('E12 account form: experience → "Counts as recent until … CALCULATED", no expiration box; BLS keeps its expiration box', !r.syncErr2 && r.acctExp[0] && /Counts as recent until/.test(r.acctExp[1]) && /CALCULATED/.test(r.acctExp[1]) && /Not an expiration/.test(r.acctExp[1]) && r.acctBls, JSON.stringify([r.syncErr2, r.acctExp]));
  ok('E13 facility "per assignment" override flows into the requirement', r.req && r.req.skills && r.req.skills.perAssignment === true, JSON.stringify(r.req));
  await pg.close();
}

/* F  v14.4 CCRN-style certificate number (reader units F1–F3 kept: admin/verifier-side reader behaviour) (no "Number" label, beside the verification address) and
      ONE expiration field on the add form (pre-filled from the document, marked, editable, mismatch note). */
async function partF(browser) {
  const { ccrnPdf, CCRN } = require('./p144-fixtures.js');
  fs.mkdirSync('/tmp/p144-fixtures', { recursive: true });
  const f1 = '/tmp/p144-fixtures/ccrn.pdf', f2 = '/tmp/p144-fixtures/ccrn-noverify.pdf';
  fs.writeFileSync(f1, ccrnPdf()); fs.writeFileSync(f2, ccrnPdf({ verifyLine: false }));
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await pg.goto(BASE, { waitUntil: 'networkidle2' });
  const W = ms => new Promise(r => setTimeout(r, ms));
  const rd = file => pg.evaluate(async b => { const r = await DocExtract.extractFromFile(new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], 'ccrn.pdf', { type: 'application/pdf' }), { kind: 'CERT_CCRN' }); return Object.fromEntries(Object.entries(r.fields).map(([k, x]) => [k, { v: x.value, c: x.conf, how: x.how }])); }, fs.readFileSync(file).toString('base64'));
  const a = await rd(f1), b = await rd(f2);
  ok('F1 CCRN: 10-digit number read beside the verification address (not the decoy), below "high" so the nurse checks it', a.credential_id && a.credential_id.v === CCRN.number && a.credential_id.c < 0.9 && a.credential_id.c >= 0.7 && /verification address/.test(a.credential_id.how), JSON.stringify(a.credential_id));
  ok('F2 CCRN: name after the grant, "Certified since/through" dates', a.holder_name && a.holder_name.v === CCRN.name && a.issued_on.v === CCRN.sinceIso && a.expires_on.v === CCRN.throughIso && a.expires_on.c >= 0.9, JSON.stringify([a.holder_name, a.issued_on, a.expires_on]));
  ok('F3 no verification line → certificate number not found (an unlabelled number is never guessed)', !b.credential_id, JSON.stringify(b.credential_id));
  // add form through the in-page fake backend
  const tap = async sel => { await pg.waitForSelector(sel, { timeout: 15000 }); await pg.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await W(120); await pg.evaluate(s => document.querySelector(s).click(), sel); };
  const setVal = (id, v) => pg.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, id, v);
  /* v14.8 (t150u): the reader only screens the file (#acctScreenBoxV148); it never fills or compares values.
     F4–F9 retired (document pre-fill / "Use the document's date"); F10–F11 rewritten. See LEGACY_TEST_MAP.md. */
  const waitScan = () => pg.waitForFunction(() => { const b = document.getElementById('acctScreenBoxV148'); return b && b.dataset.state && b.dataset.state !== 'checking'; }, { timeout: 90000 });
  await pg.evaluate(require('./p14-fake.js'));
  await pg.evaluate(async () => { await store.account.hydrate(); acctShow('acctPassportV10'); }); await W(300);
  const st = () => pg.evaluate(() => ({ exp: $('acctExpV10').value, origin: $('acctExpV10').dataset.origin || null, screen: $('acctScreenBoxV148') && $('acctScreenBoxV148').dataset.state, scanBox: !!$('acctScanBoxV14'), useDoc: !!$('acctUseDocDateV14') }));
  // typed first, then a file attached: the typed date is kept (nothing is ever filled from the document)
  await tap('[data-act="toggle-add"]'); await W(200);
  await pg.select('#acctKindV10', 'CERT_CCRN'); await setVal('acctExpV10', '2027-01-31');
  await (await pg.$('#acctFileV10')).uploadFile(f1); await W(200); await waitScan(); await W(200);
  const s4 = await st();
  ok('F10 (rewritten v14.8) a date typed before the file is attached is never overwritten; no "Use the document\'s date" offer', s4.exp === '2027-01-31' && s4.origin !== 'document' && !s4.scanBox && !s4.useDoc && s4.screen === 'clear', JSON.stringify(s4));
  await pg.evaluate(EXPOK); await tap('#acctAddFormV10 button[type=submit]'); await W(800);
  const saved2 = await pg.evaluate(() => { const c = __fakeDb.credentials.filter(x => x.kind === 'CERT_CCRN').pop(); return c && { exp: c.expires_on, status: c.status, keys: Object.keys(c.metadata || {}).sort().join(','), ev: __fakeDb.audit_events.filter(e => e.credential_id === c.id).map(e => e.event_type) }; });
  ok('F11 (rewritten v14.8) saved exactly as typed, not verified, no DOCUMENT_DATE_APPLIED and no document values in metadata', saved2 && saved2.exp === '2027-01-31' && saved2.status !== 'VERIFIED' && !saved2.ev.includes('DOCUMENT_DATE_APPLIED') && !/doc|holder|number|issued/.test(saved2.keys), JSON.stringify(saved2));
  ok('F12 no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

function partC() {
  const root = path.join(__dirname, '..', '..', 'js');
  const files = ['account.js', 'credential-catalog.js', 'menu.js', 'roles/clinician.js', 'roles/verifier.js', 'readiness-engine.js', 'insights.js'];
  const all = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const strings = (all.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || []).filter(s => /home state/i.test(s) && !/keywords|nlc multistate home state/.test(s));
  ok('C1 no user-facing "home state" wording left (compact explanations say "primary state of residence")', strings.length === 0, strings.slice(0, 3).join(' | '));
  ok('C2 license type option reads "issued by your primary state of residence"', /Multistate \(compact\) — issued by your primary state of residence/.test(all));
  ok('C3 compact explanation (v14.5): "Multistate licenses are issued by your primary state of residence (X)"', /Multistate licenses are issued by your primary state of residence \(\$\{h\.name\}\)/.test(all + fs.readFileSync(path.join(root, 'credential-catalog.js'), 'utf8')));
}

(async () => {
  partA(); partC(); partD();
  if (process.env.UNITS_ONLY) { const f = R.filter(l => l.startsWith('FAIL')).length; console.log(`\np144 units: ${R.length - f} passed, ${f} failed`); process.exit(f ? 1 : 0); }
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  try { if (!process.env.ONLY || process.env.ONLY === 'E') await partE(browser); if (!process.env.ONLY || process.env.ONLY === 'F') await partF(browser); if (!['E', 'F'].includes(process.env.ONLY)) await partB(browser); } finally { await browser.close(); }
  const pass = R.filter(l => l.startsWith('PASS')).length, fail = R.filter(l => l.startsWith('FAIL')).length;
  console.log(`\np144: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
