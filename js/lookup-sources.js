/* Public issuer lookup pages, confirmed October 2026.
   A verifier opens the page, checks the credential there, and records the
   result. The URL is not proof by itself. Kinds with no confirmed public
   lookup page get lookupUrl: null — the UI does not invent one. */
const LOOKUP_SOURCES = [
  { id: 'nursys', name: 'Nursys QuickConfirm',
    url: 'https://www.nursys.com/LQC/LQCTerms.aspx',
    kinds: ['RN_LICENSE', 'RN_LICENSE_MULTISTATE'],
    note: 'Free license and discipline lookup. Participating boards send the data. This is the issuer check for an RN license.' },
  { id: 'aha', name: 'AHA eCard verification',
    url: 'https://ecards.heart.org/student/myecards?pid=ahaecard.employerStudentSearch',
    kinds: ['CERT_BLS', 'CERT_ACLS', 'CERT_PALS'],
    note: 'Employer tab: enter the eCard code. If the code contains letters, it is an RQI card — use https://www.heart.org/RQIverify instead. Red Cross cards use https://www.redcross.org/take-a-class/digital-certificate (or https://redcross.healthstream.com/ for a 6-character hStream ID).' },
  { id: 'aacn', name: 'AACN certification verification',
    url: 'https://www.aacn.org/certification/verify-certification',
    kinds: ['CERT_CCRN', 'CERT_PCCN', 'CERT_CMC', 'CERT_CSC'],
    note: 'AACN says this system may be used as primary source verification for AACN certifications.' },
  { id: 'bcen', name: 'BCEN certification verification',
    url: 'https://bcen.org/verify-certification/',
    kinds: ['CERT_CEN', 'CERT_CPEN', 'CERT_TCRN', 'CERT_CFRN', 'CERT_CTRN'],
    note: 'BCEN does not offer an open search box. The nurse requests a verification email or shares a digital badge from their BCEN account.' },
  { id: 'ncc', name: 'NCC primary source verification',
    url: 'https://www.nccwebsite.org/verifications/request',
    kinds: ['CERT_RNC_OB', 'CERT_C_EFM', 'CERT_RNC_MNN', 'CERT_RNC_NIC', 'CERT_RNC_LRN'],
    note: 'The certificant starts an NCC verification request. See also https://www.nccwebsite.org/about-ncc/primary-source-verification.' }
];
function lookupForKind(kind) {
  return LOOKUP_SOURCES.find(s => s.kinds.includes(kind)) || null;
}
