/* XRPL anchor for a verification commitment (PR 12).
   The memo is only the SHA-256 hex of the canonical record. No names,
   emails, license numbers, eCard codes, or reference numbers go on-ledger.
   Staging: the signing seed is created in this browser session (Testnet
   faucet) and kept only in this tab's memory. Sign-out drops it. It is never
   sent to Veridun and never written into the repo. Production uses a
   server-held key (backend/supabase/functions/anchor-verification).
   Readiness does not look at this. */
const XRPL_ANCHOR = {
  memoVerification: 'veridun.verification-anchor.v1',
  memoActivity: 'veridun.activity-anchor.v1',
  nets: {
    XRPL_TESTNET: { label: 'XRPL Testnet', ws: 'wss://s.altnet.rippletest.net:51233', explorer: 'https://testnet.xrpl.org' },
    XRPL_DEVNET: { label: 'XRPL Devnet', ws: 'wss://s.devnet.rippletest.net:51233', explorer: 'https://devnet.xrpl.org' }
  }
};
let xrplSessionWallet = null;
function verificationCanonical(p) {
  return [
    'veridun-verification-v1',
    'credential_id=' + p.credential_id,
    'kind=' + p.kind,
    'holder_id=' + p.holder_id,
    'result=' + p.result,
    'source=' + p.source,
    'verified_at=' + p.verified_at,
    'expiration=' + (p.expiration || ''),
    'salt=' + p.salt
  ].join('\n');
}
function activityCanonical(p) {
  return [
    'veridun-activity-v1',
    'clinician_id=' + p.clinician_id,
    'through_event_id=' + p.through_event_id,
    'event_count=' + p.event_count,
    'events_hash=' + p.events_hash,
    'salt=' + p.salt
  ].join('\n');
}
function xrplHexToUtf8(hex) {
  if (!hex) return '';
  const h = String(hex).replace(/^0x/i, '');
  let s = '';
  for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return s;
}
function anchorClearWallet(){xrplSessionWallet=null}
async function anchorWallet(client) {
  if (xrplSessionWallet) return xrplSessionWallet;
  const funded = await client.fundWallet();
  xrplSessionWallet = funded.wallet;
  return xrplSessionWallet;
}
async function submitAnchor(commitment, memoType, preferred) {
  if (typeof xrpl === 'undefined') throw new Error('XRPL library did not load. Check your connection.');
  if (!/^[0-9a-f]{64}$/.test(commitment)) throw new Error('Commitment must be a SHA-256 hex string.');
  const order = preferred === 'XRPL_DEVNET' ? ['XRPL_DEVNET', 'XRPL_TESTNET'] : ['XRPL_TESTNET', 'XRPL_DEVNET'];
  let last;
  for (const id of order) {
    const net = XRPL_ANCHOR.nets[id];
    const client = new xrpl.Client(net.ws);
    try {
      await client.connect();
      const wallet = await anchorWallet(client);
      const tx = {
        TransactionType: 'AccountSet',
        Account: wallet.address,
        Memos: [{ Memo: {
          MemoType: xrpl.convertStringToHex(memoType).toUpperCase(),
          MemoData: xrpl.convertStringToHex(commitment).toUpperCase(),
          MemoFormat: xrpl.convertStringToHex('text/plain').toUpperCase()
        } }]
      };
      const r = await client.submitAndWait(tx, { wallet, autofill: true });
      const code = r.result.meta?.TransactionResult;
      if (code !== 'tesSUCCESS') throw new Error(code || 'Transaction failed');
      return { txHash: r.result.hash, ledger: r.result.ledger_index || null, address: wallet.address, network: id, memoType };
    } catch (e) { last = e; anchorClearWallet(); }
    finally { if (client.isConnected()) await client.disconnect(); }
  }
  throw new Error('Could not anchor on XRPL Testnet or Devnet. ' + (last && last.message || ''));
}
function anchorExplorerUrl(network, txHash) {
  const net = XRPL_ANCHOR.nets[network] || XRPL_ANCHOR.nets.XRPL_TESTNET;
  return net.explorer + '/transactions/' + txHash;
}
async function checkMemoOnLedger(row, expected) {
  if (typeof xrpl === 'undefined') return { match: false, reason: 'XRPL library did not load.' };
  if (!row.tx_hash) return { match: false, reason: 'Not anchored yet.', local: expected || '' };
  const local = expected || null;
  const net = XRPL_ANCHOR.nets[row.network] || XRPL_ANCHOR.nets.XRPL_TESTNET;
  const client = new xrpl.Client(net.ws);
  try {
    await client.connect();
    const r = await client.request({ command: 'tx', transaction: row.tx_hash });
    const tx = Object.assign({}, r.result, r.result.tx_json || {});
    const memos = (tx.Memos || []).map(m => ({
      type: xrplHexToUtf8(m.Memo?.MemoType),
      data: xrplHexToUtf8(m.Memo?.MemoData)
    }));
    const hit = memos.find(m => m.type === (row.memo_type || XRPL_ANCHOR.memoVerification));
    const onChain = hit ? hit.data.toLowerCase() : '';
    const want = String(expected || row.commitment || '').toLowerCase();
    const match = !!hit && onChain === want && (!local || onChain === local);
    const personal = memos.some(m => /@|license|ecard|ssn|dob/i.test(m.data) && !/^[0-9a-f]{64}$/i.test(m.data.trim()));
    return {
      match, local, onChain, personal,
      reason: match ? 'Matches ledger' : (hit ? 'Mismatch / altered' : 'Memo not found on the transaction'),
      address: tx.Account || r.result.Account || '',
      network: row.network,
      label: net.label
    };
  } catch (e) {
    return { match: false, reason: 'Could not read the ledger (' + (e.message || e) + ').', local };
  } finally { if (client.isConnected()) await client.disconnect(); }
}

async function checkAnchorOnLedger(row){const local=await SupabaseMapping.sha256Hex(verificationCanonical(row));const r=await checkMemoOnLedger(row, local);r.local=local;if(r.onChain&&r.onChain!==local){r.match=false;r.reason='Mismatch / altered'}return r}
