// Production-shaped anchor. NOT DEPLOYED.
// Holds the XRPL seed in a function secret (XRPL_SEED), never in the browser
// or the repo. Munib deploys it (see docs/BACKEND.md). The staging site uses
// a per-verifier Testnet wallet in the browser session instead, because this
// environment has no Supabase access token.
//
// Body: { commitment: "<64 hex>", memoType: "veridun.verification-anchor.v1", network?: "XRPL_TESTNET" }
// Header: Authorization: Bearer <user JWT>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2'
import { Client, Wallet } from 'https://esm.sh/xrpl@5.3.0'

const NETS: Record<string, string> = {
  XRPL_TESTNET: 'wss://s.altnet.rippletest.net:51233',
  XRPL_DEVNET: 'wss://s.devnet.rippletest.net:51233'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })
  const seed = Deno.env.get('XRPL_SEED')
  if (!seed) return new Response('XRPL_SEED is not set', { status: 500 })
  const auth = req.headers.get('Authorization') || ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) return new Response('Sign in required', { status: 401 })
  const { data: row } = await supabase.from('users').select('role').eq('id', userData.user.id).maybeSingle()
  if (!row || !['verifier', 'admin'].includes(row.role)) return new Response('Verifier only', { status: 403 })
  const body = await req.json().catch(() => ({}))
  const commitment = String(body.commitment || '')
  if (!/^[0-9a-f]{64}$/.test(commitment)) return new Response('commitment must be 64 hex chars', { status: 400 })
  const memoType = String(body.memoType || 'veridun.verification-anchor.v1')
  if (!/^veridun\.[a-z0-9.-]+$/.test(memoType)) return new Response('bad memo type', { status: 400 })
  const network = NETS[body.network] ? body.network : 'XRPL_TESTNET'
  const client = new Client(NETS[network])
  await client.connect()
  try {
    const wallet = Wallet.fromSeed(seed)
    const tx = {
      TransactionType: 'AccountSet',
      Account: wallet.address,
      Memos: [{ Memo: {
        MemoType: Buffer.from(memoType).toString('hex').toUpperCase(),
        MemoData: Buffer.from(commitment).toString('hex').toUpperCase(),
        MemoFormat: Buffer.from('text/plain').toString('hex').toUpperCase()
      } }]
    }
    const r = await client.submitAndWait(tx, { wallet, autofill: true })
    if (r.result.meta?.TransactionResult !== 'tesSUCCESS') {
      return new Response(r.result.meta?.TransactionResult || 'failed', { status: 502 })
    }
    return Response.json({
      txHash: r.result.hash,
      ledger: r.result.ledger_index,
      address: wallet.address,
      network
    })
  } finally {
    await client.disconnect()
  }
})
