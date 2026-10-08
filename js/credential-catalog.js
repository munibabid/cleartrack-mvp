/* Credential catalog (STUB — planned for PR 2).

   Will hold the RN-focused credential catalog from the handoff: canonical
   credential kinds (RN_LICENSE, CERT_BLS, CERT_ACLS, ...), jurisdictions,
   display names, searchable-dropdown metadata, and per-kind privacy and
   verification policy (what stays private/off-chain, which source verifies it).

   Today the equivalent logic lives in v81Type()/v81Name() in
   credential-model.js and the <select> options in the Add Credential dialog. */
