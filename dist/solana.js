"use strict";
// backend/src/solana.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeTransactions = exports.getTopHolders = void 0;
const web3_js_1 = require("@solana/web3.js");
// ─── RPC SETUP ────────────────────────────────────────────────────────────────
const RPC_ENDPOINT = process.env.RPC_ENDPOINT ||
    'https://api.mainnet-beta.solana.com';
const connection = new web3_js_1.Connection(RPC_ENDPOINT, {
    commitment: 'confirmed',
});
// ─── RETRY HELPER ─────────────────────────────────────────────────────────────
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function withRetry(fn, maxRetries = 5, initialDelay = 500) {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        }
        catch (err) {
            if (attempt < maxRetries &&
                err.message.includes('429')) {
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
const TOKEN_MINT = new web3_js_1.PublicKey('9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump');
/**
 * Fetch the top 60 holders for TOKEN_MINT.
 */
async function getTopHolders() {
    const resp = await withRetry(() => connection.getTokenLargestAccounts(TOKEN_MINT));
    // Here, resp.value is Typed as `TokenAccountBalancePair[]`
    return resp.value.slice(0, 60).map((v) => ({
        address: v.address.toBase58(),
        amount: v.uiAmount ?? 0,
    }));
}
exports.getTopHolders = getTopHolders;
// ─── TRANSACTION POLLING ────────────────────────────────────────────────────
let lastSeenSig = null;
/**
 * Polls for new transactions every 15s, parses them, and invokes your handler.
 */
function subscribeTransactions(handler) {
    async function poll() {
        const sigs = await connection.getSignaturesForAddress(TOKEN_MINT, { limit: 100 });
        const newSigs = lastSeenSig
            ? sigs.filter((s) => s.signature !== lastSeenSig)
            : sigs;
        if (sigs.length) {
            lastSeenSig = sigs[0].signature;
        }
        for (const info of newSigs.reverse()) {
            try {
                const full = await connection.getParsedTransaction(info.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
                if (!full || !full.transaction)
                    continue;
                const keys = full.transaction.message.accountKeys;
                if (!keys || keys.length === 0)
                    continue;
                const first = keys[0];
                const wallet = first instanceof web3_js_1.PublicKey
                    ? first.toBase58()
                    : first.pubkey.toBase58();
                const tx = {
                    signature: info.signature,
                    timestamp: (full.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
                    wallet,
                    amount: 0,
                    type: 'unknown',
                    protocol: 'unknown' // TODO: detect protocol via program IDs
                };
                await handler(tx);
            }
            catch (e) {
                if (!e.message.includes('maxSupportedTransactionVersion')) {
                    console.error(`[solana.ts] error processing ${info.signature}:`, e);
                }
            }
        }
        return; // explicit void
    }
    // kick off now + every 15 seconds
    poll().catch(console.error);
    setInterval(() => poll().catch(console.error), 15000);
}
exports.subscribeTransactions = subscribeTransactions;
