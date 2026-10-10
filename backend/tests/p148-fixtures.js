/* v14.8 P0 safety-stop fixtures. PUBLIC SYNTHETIC documents only: fake names, fake numbers,
   every page stamped "NOT A REAL CREDENTIAL". They imitate the KINDS of documents that the
   readiness-v1 walkthrough showed the site accepting wrongly (merged BLS+ACLS, Red Cross ALS as
   ACLS, LVN as RN, spaced/smudged license numbers, Renewed/Renew-By dates, NIHSS dates). They are
   NOT the private readiness-v1 documents, and no answer key or scorer is used or committed.
   expect: 'CLEAR' (nothing blocks; the nurse types the details) or a block code. */
const { buildPdf } = require('./lib/mini-pdf');
const BANNER = 'NOT A REAL CREDENTIAL - SYNTHETIC TEST DOCUMENT';
const page = lines => ({ text: [{ s: BANNER, x: 230, y: 590, size: 10, bold: true }, ...lines.map((s, i) => ({ s, x: 80, y: 540 - i * 26, size: 13 }))] });
const pdf = (...pages) => buildPdf(pages.map(page));
const NAME = 'Name: Testa Fakename';
const BLS = ['American Heart Association', 'BLS Provider', 'Basic Life Support', NAME, 'eCard Code: 261100000017', 'Issue Date: 06/03/2026', 'Recommended Renewal Date: 06/2028', 'Training Center: Example Training Center'];
const ACLS = ['American Heart Association', 'ACLS Provider', 'Advanced Cardiovascular Life Support', NAME, 'eCard Code: 261100000018', 'Issue Date: 06/04/2026', 'Recommended Renewal Date: 06/2028', 'Training Center: Example Training Center'];
const PALS = ['American Heart Association', 'PALS Provider', 'Pediatric Advanced Life Support', NAME, 'eCard Code: 261100000019', 'Issue Date: 06/05/2026', 'Recommended Renewal Date: 06/2028'];
const NIHSS = ['NIH Stroke Scale Certification', 'Certificate of Completion', NAME, 'Certificate Number: NIH-00042', 'Completion Date: 09/12/2026', 'Group C'];
const CASES = [
  { id: 'tx-rn', kind: 'RN_LICENSE', jur: 'US-TX', expect: 'CLEAR', secrets: ['990011', '2028-01-31'], pages: [['Texas Board of Nursing', 'Registered Nurse', NAME, 'License Number: 990011', 'Multistate License', 'Issued: 02/01/2024', 'Expiration Date: 01/31/2028']] },
  { id: 'rv06-merged-bls-acls', kind: 'CERT_BLS', expect: 'MULTIPLE', pages: [BLS, ACLS] },
  { id: 'rv06-merged-one-page', kind: 'CERT_ACLS', expect: 'MULTIPLE', pages: [[...BLS.slice(0, 3), ...ACLS.slice(1, 3), NAME, 'eCard Code: 261100000020']] },
  { id: 'rv38-redcross-als', kind: 'CERT_ACLS', expect: 'ALS_NOT_ACLS', pages: [['American Red Cross', 'Advanced Life Support', NAME, 'Certificate ID: 01ABCD2', 'Completed: 05/01/2026', 'Valid For: 2 Years']] },
  { id: 'rv46-lvn', kind: 'RN_LICENSE', jur: 'US-TX', expect: 'LVN_LPN', pages: [['Texas Board of Nursing', 'Licensed Vocational Nurse', NAME, 'License Number: 123456', 'Expiration Date: 08/31/2027']] },
  { id: 'rv46-lpn', kind: 'RN_LICENSE', jur: 'US-OH', expect: 'LVN_LPN', pages: [['Ohio Board of Nursing', 'Licensed Practical Nurse', NAME, 'License Number: PN.123456', 'Expiration Date: 10/31/2027']] },
  { id: 'mixed-rn-lpn', kind: 'RN_LICENSE', jur: 'US-OH', expect: 'BLOCK_ANY', pages: [['Ohio Board of Nursing', 'Registered Nurse', 'Licensed Practical Nurse', NAME, 'License Number: RN.123456', 'Expiration Date: 10/31/2027']] },
  { id: 'rv22-fl-spaces', kind: 'RN_LICENSE', jur: 'US-FL', expect: 'CLEAR', secrets: ['9518846', '2028-04-30'], pages: [['Florida Board of Nursing', 'Registered Nurse', NAME, 'License Number: RN 9518846', 'Expires: 04/30/2028']] },
  { id: 'rv24-fl-spaces', kind: 'RN_LICENSE', jur: 'US-FL', expect: 'CLEAR', secrets: ['951 8847'], pages: [['Florida Board of Nursing', 'Registered Nurse', NAME, 'License No.: RN 951 8847', 'Expiration: 07/31/2027']] },
  { id: 'rv58-smudge', kind: 'RN_LICENSE', jur: 'US-AZ', expect: 'CLEAR', secrets: ['8846'], pages: [['Arizona State Board of Nursing', 'Registered Nurse', NAME, 'License Number: RN95?8846', 'Expiration Date: 05/31/2028']] },
  { id: 'rv11-ambiguous-exp', kind: 'RN_LICENSE', jur: 'US-NJ', expect: 'CLEAR', secrets: ['2028-03-04', '2028-04-03'], pages: [['New Jersey Board of Nursing', 'Registered Nurse', NAME, 'License Number: 26NR00012300', 'Expires: 03/04/2028']] },
  { id: 'rv27-clear-status', kind: 'RN_LICENSE', jur: 'US-MI', expect: 'CLEAR', secrets: ['2027-06-30'], pages: [['Michigan LARA - Bureau of Professional Licensing', 'Registered Nurse', NAME, 'License Number: 4704000001', 'Status: CLEAR', 'Expiration: 06/30/2027']] },
  { id: 'renewed-license', kind: 'RN_LICENSE', jur: 'US-CO', expect: 'CLEAR', secrets: ['2026-01-15', '2028-01-31'], pages: [['Colorado Board of Nursing', 'Registered Nurse', NAME, 'License Number: RN.0001234', 'Renewed: 01/15/2026', 'Expires: 01/31/2028']] },
  { id: 'renewed-only', kind: 'RN_LICENSE', jur: 'US-OH', expect: 'CLEAR', secrets: ['2025-10-01', '2027-10-31'], pages: [['Ohio Board of Nursing', 'Registered Nurse', NAME, 'License Number: RN.765432', 'Last Renewed: 10/01/2025', 'Renewal Date: 10/31/2027']] },
  { id: 'renew-by-bls', kind: 'CERT_BLS', expect: 'CLEAR', secrets: ['2028-06'], pages: [['American Heart Association', 'BLS Provider', 'Basic Life Support', NAME, 'eCard Code: 261100000021', 'Issue Date: 06/03/2026', 'Renew By: 06/2028']] },
  { id: 'rv48-nihss', kind: 'CERT_NIHSS', expect: 'CLEAR', secrets: ['2026-09-12', '2027-09-12'], pages: [NIHSS] },
  { id: 'cover-sheet-nihss', kind: 'CERT_NIHSS', expect: 'CLEAR', pages: [['Fax Cover Sheet', 'To: Credentialing Office', 'From: Testa Fakename', 'Pages: 2'], NIHSS] },
  { id: 'acls-ok', kind: 'CERT_ACLS', expect: 'CLEAR', pages: [ACLS] },
  { id: 'bls-ok', kind: 'CERT_BLS', expect: 'CLEAR', pages: [BLS] },
  { id: 'acls-claimed-bls', kind: 'CERT_BLS', expect: 'TYPE_MISMATCH', pages: [ACLS] },
  { id: 'pals-claimed-bls', kind: 'CERT_BLS', expect: 'BLOCK_ANY', pages: [PALS] },
  // t150u: a document the check can't identify (no credential named) is NOT a conflict: manual path, never a hard block
  { id: 'unrecognized-doc', kind: 'CERT_BLS', expect: 'CLEAR', secrets: ['2031-01-01'], pages: [['Community Health Newsletter', 'Spring edition', 'Upcoming classes and parking information', 'Printed: 01/01/2031']] },
  { id: 'unrecognized-rn', kind: 'RN_LICENSE', jur: 'US-MI', expect: 'CLEAR', pages: [['Wallet card', 'Keep this card with you', NAME]] },
  { id: 'pals-claimed-pals', kind: 'CERT_PALS', expect: 'UNSUPPORTED_KIND', pages: [PALS] },
];
for (const c of CASES) c.pdf = pdf(...c.pages);
module.exports = { CASES, BANNER, pdf };
