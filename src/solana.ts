// backend/src/solana.ts

import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedConfirmedTransaction,
} from '@solana/web3.js';

export interface Holder {
  address: string;
  amount: number;
}

export interface ParsedTx {
  signature: string;
  timestamp: number;
  wallet: string;
  amount: number;
  type: string;
  protocol: string;
}

// ─── RPC SETUP ────────────────────────────────────────────────────────────────
const RPC_ENDPOINT =
  process.env.RPC_ENDPOINT ||
  'https://api.mainnet-beta.solana.com';

const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
});

// ─── RETRY HELPER ─────────────────────────────────────────────────────────────
async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      if (
        attempt < maxRetries &&
        err.message.includes('429')
      ) {
        const backoff = initialDelay * 2 ** attempt;
        console.warn(`[solana.ts] Rate‐limited, retry #${attempt + 1} in ${backoff}ms…`);
        await sleep(backoff);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

// ─── TOP HOLDERS ──────────────────────────────────────────────────────────────
const TOKEN_MINT = new PublicKey(
  '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump'
);

/**
 * Fetch the top 60 holders for TOKEN_MINT.
 */
export async function getTopHolders(): Promise<Holder[]> {
  const resp = await withRetry(() =>
    connection.getTokenLargestAccounts(TOKEN_MINT)
  );
  // Here, resp.value is Typed as `TokenAccountBalancePair[]`
  return resp.value.slice(0, 60).map((v: { address: PublicKey; uiAmount: number | null }) => ({
    address: v.address.toBase58(),
    amount: v.uiAmount ?? 0,
  }));
}

// ─── TRANSACTION POLLING ────────────────────────────────────────────────────
let lastSeenSig: string | null = null;

/**
 * Polls for new transactions every 15s, parses them, and invokes your handler.
 */
export function subscribeTransactions(
  handler: (tx: ParsedTx) => Promise<void>
): void {
  async function poll(): Promise<void> {
    const sigs: ConfirmedSignatureInfo[] =
      await connection.getSignaturesForAddress(TOKEN_MINT, { limit: 100 });

    const newSigs = lastSeenSig
      ? sigs.filter((s) => s.signature !== lastSeenSig)
      : sigs;

    if (sigs.length) {
      lastSeenSig = sigs[0].signature;
    }

    for (const info of newSigs.reverse()) {
      try {
        const full: ParsedConfirmedTransaction | null =
          await connection.getParsedTransaction(
            info.signature,
            { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }
          );
        if (!full || !full.transaction) continue;

        const keys = full.transaction.message.accountKeys;
        if (!keys || keys.length === 0) continue;

        const first = keys[0];
        const wallet = first instanceof PublicKey
          ? first.toBase58()
          : first.pubkey.toBase58();

        const tx: ParsedTx = {
          signature: info.signature,
          timestamp: (full.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
          wallet,
          amount: 0,       // TODO: parse SPL amount from full.meta
          type: 'unknown', // TODO: detect buy vs sell
          protocol: 'unknown' // TODO: detect protocol via program IDs
        };

        await handler(tx);
      } catch (e: any) {
        if (!e.message.includes('maxSupportedTransactionVersion')) {
          console.error(`[solana.ts] error processing ${info.signature}:`, e);
        }
      }
    }

    return; // explicit void
  }

  // kick off now + every 15 seconds
  poll().catch(console.error);
  setInterval(() => poll().catch(console.error), 15_000);
}
