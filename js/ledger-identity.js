/* v14.8 XRPL credential identity (Anchor role; Resolver role owns collisions).
   Two separate concepts:
   - semantic_type: what the credential IS (catalog kind, e.g. RN_LICENSE, CERT_BLS). Readiness,
     policy and Sentinel logic keep using this (c.kind / c.type) and never read the ledger id.
   - ledger_credential_type: a stable, opaque, random proof identifier used as the XRPL
     CredentialType. Generated once per credential record, never derived from the holder name,
     license number, jurisdiction, DOB or any other credential field, so it carries no personal data.
     Several RN licenses (CA + MA) and several generations of one credential (renewals) therefore
     never collide on the ledger (XRPL allows one Credential per Subject + Issuer + CredentialType).
   Proofs issued before v14.8 used the semantic code (c.type) as CredentialType. They stay valid and
   are labelled legacy; they are never re-keyed while they exist on the ledger.
   Plain script (shared global scope in the browser) and a CommonJS module for Node tests. */
(function (root) {
  const PROOF_SCHEMA = 'veridun.xrpl-credential.v1';
  const NETWORK = 'XRPL_DEVNET';
  const PREFIX = 'vc1_';
  const ID_RE = /^vc1_[0-9a-f]{32}$/;
  const NETWORK_LABEL = { XRPL_DEVNET: 'XRPL Devnet', XRPL_TESTNET: 'XRPL Testnet', XRPL_MAINNET: 'XRPL Mainnet' };
  function randomBytes(n) {
    const c = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (c && c.getRandomValues) return c.getRandomValues(new Uint8Array(n));
    if (typeof require === 'function') return new Uint8Array(require('crypto').randomBytes(n));
    throw new Error('No secure random source available');
  }
  /* 128 random bits → "vc1_" + 32 hex = 36 bytes (72 hex chars), well inside XRPL's 64-byte CredentialType limit. */
  function newId(bytes) { const b = (bytes || randomBytes)(16); return PREFIX + Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
  function isValidId(s) { return typeof s === 'string' && ID_RE.test(s); }
  function hasProofActivity(c) { return !!(c && (c.proofPending || c.issueTx || (c.chain && c.chain !== 'NOT ISSUED'))); }
  /* Proof on (or heading to) the ledger with the old semantic CredentialType. */
  function isLegacyProof(c) { return !!c && !isValidId(c.ledgerCredentialType) && !!(c.proofPending || (c.chain && c.chain !== 'NOT ISSUED')); }
  function semanticType(c) { return (c && c.kind) || String((c && c.type) || '').split(':')[0]; }
  function collisionWith(c, all) { if (!c || !isValidId(c.ledgerCredentialType)) return null; return (all || []).find(x => x && x !== c && x.id !== c.id && x.ledgerCredentialType === c.ledgerCredentialType) || null; }
  function taken(id, c, all) { return (all || []).some(x => x && x !== c && x.id !== c.id && x.ledgerCredentialType === id); }
  /* Returns the credential's ledger id, assigning one the first time. Never changes an id that a
     proof already uses. A copied record holding another credential's id that has never been issued
     gets a fresh id; two issued records sharing one id is refused (Resolver case), never re-pointed. */
  function ensure(c, all, gen) {
    if (!c) throw new Error('No credential');
    if (isLegacyProof(c)) throw new Error('Legacy proof: it keeps its original CredentialType and is not re-keyed');
    if (isValidId(c.ledgerCredentialType)) {
      const other = collisionWith(c, all);
      if (!other || hasProofActivity(c)) {
        if (other && hasProofActivity(other)) throw new Error('Ledger id collision between two issued proofs — needs review');
        linkSupersession(c, all); return c.ledgerCredentialType;
      }
    }
    const g = gen || newId; let id = null;
    for (let i = 0; i < 16; i++) { const x = g(); if (isValidId(x) && !taken(x, c, all)) { id = x; break; } }
    if (!id) throw new Error('Could not generate a unique ledger id');
    c.ledgerCredentialType = id; c.ledgerProofSchema = PROOF_SCHEMA; c.ledgerIdCreatedAt = new Date().toISOString();
    linkSupersession(c, all); return id;
  }
  /* A renewal (c.renews = earlier record id) records which ledger proof it supersedes. */
  function linkSupersession(c, all) {
    if (c.renews == null || c.ledgerSupersedes) return;
    const old = (all || []).find(x => x && x.id === c.renews);
    if (old && isValidId(old.ledgerCredentialType)) c.ledgerSupersedes = old.ledgerCredentialType;
  }
  /* The string used as CredentialType for this credential's proof (accept, lookups). */
  function proofTypeString(c) {
    if (isValidId(c && c.ledgerCredentialType)) return c.ledgerCredentialType;
    if (isLegacyProof(c)) return c.type;
    throw new Error('Credential has no ledger id yet');
  }
  function networkLabel(n) { return NETWORK_LABEL[n] || String(n || ''); }
  /* One Passport entry. Semantic type (st) and ledger id (l) are separate fields; t keeps the
     machine-readable type for display and pre-v14.8 readers. Legacy entries carry lg:1 and no l. */
  function passportEntry(c) {
    const e = { t: c.type, st: semanticType(c), n: c.name, e: c.expiration || '', s: (c.prov && c.prov.source) || '', v: (c.prov && c.prov.verifiedAt) || '',
      net: c.proofNetwork || NETWORK, tx: c.acceptTx || '', li: c.acceptLedger || '' };
    if (isValidId(c.ledgerCredentialType)) { e.l = c.ledgerCredentialType; e.ps = c.ledgerProofSchema || PROOF_SCHEMA; if (isValidId(c.ledgerSupersedes)) e.sp = c.ledgerSupersedes; }
    else e.lg = 1;
    return e;
  }
  /* How the public page looks an entry up. A present-but-malformed l is INVALID: it is never
     downgraded to a legacy semantic-code lookup. */
  function lookupFor(e) {
    if (e && e.l != null && e.l !== '') return isValidId(e.l) ? { mode: 'LEDGER_ID', str: e.l } : { mode: 'INVALID', str: '' };
    if (e && typeof e.t === 'string' && e.t) return { mode: 'LEGACY', str: e.t };
    return { mode: 'INVALID', str: '' };
  }
  /* DOM ids come from the row position (unique per list), never from the semantic type. */
  function domId(prefix, i) { return String(prefix).replace(/[^A-Za-z0-9_-]/g, '') + '-' + (Number(i) | 0); }
  const api = { PROOF_SCHEMA, NETWORK, newId, isValidId, isLegacyProof, semanticType, collisionWith, ensure, proofTypeString, passportEntry, lookupFor, domId, networkLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LedgerIdentity = api;
})(typeof window !== 'undefined' ? window : globalThis);
