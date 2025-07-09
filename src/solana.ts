

import {
  Connection,
  PublicKey,
  ParsedInstruction,
  PartiallyDecodedInstruction,
} from '@solana/web3.js';
import axios from 'axios';

export interface ParsedTx {
  signature: string;
  timestamp: number;
  wallet: string;
  amount: number;
  type: 'buy' | 'sell' | 'swap';
  protocol: string;
}

const RPC_ENDPOINT =
  process.env.RPC_ENDPOINT ??
  'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
});

const sleep = (ms: number) =>
  new Promise((res) => setTimeout(res, ms));
async function retry<T>(
  fn: () => Promise<T>,
  tries = 5,
  delay = 500
): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (tries > 0 && /429/.test(e.message)) {
      await sleep(delay);
      return retry(fn, tries - 1, delay * 2);
    }
    throw e;
  }
}

const TOKEN_MINT = new PublicKey(
  '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump'
);

// ─── MAPPED PROTOCOL IDS ──────────────────────────
const PROTOCOL_IDS: Record<string,string> = {
  // Jupiter
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: 'Jupiter',
  JUP2jxv1k2kFzAb4E4SDoz32WEEeR7J5iYjD4npCXE1: 'Jupiter',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter',

  // Raydium core programs
  RVKd61ztZW9DpoGJU9kBX9Z2zm2cn13FMvxRKv2cxv5: 'Raydium',
  EhhTKz6NmQHP7nP9oTaqmZjmnENPJwT2oZrBoC2Q6Bif: 'Raydium',

  
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium',
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: 'Raydium',
  bank7GaK8LkjyrLpSZjGuXL8z7yae6JqbunEEnU9FS4: 'Raydium',
  King7ki4SKMBPb3iupnQwTyjsq294jaXsgLmJo8cb7T: 'Raydium',
  '3HXfeBuc1aPwAvBsdReNXKa7j1jSP3khbHbWCVkU8hUu': 'Raydium',

  // Orca core programs
  '9WwGbnrthYgW5d5RMJ4WRv19y1tr9Gg9V1paXHUrvGQg': 'Orca',
  '49BLuDCCN5RiKcd8RoEJ9Q7ajQQLBM8yT9uEjFj7yUQh': 'Orca',

  
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca',
  CatMoR2RWH47v8TYnKi76oV57E5DhYMRqAroKUGCMxTu: 'Orca',
  CoTh2vLV87d3wBM7pgLYkkh4q7WBKcVGnVzL3ABuwVR4: 'Orca',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Orca',
  DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH: 'Orca',
  CTUFfGRhcnJNXCfbHfYRnD6pzNtiWzER7JxvmbLzeB19: 'Orca',
};


const IGNORE_PIDS = new Set<string>([
  'ComputeBudget111111111111111111111111111111',
  'Sysvar111111111111111111111111111111111111',
  'BPFLoaderUpgradeab1e11111111111111111111111',
  '11111111111111111111111111111111', // System
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'SoLFiHG9TfgtdUXUjWAxi3LtvYuFyDLVhBWxdMZxyCe',
  'DrPPG5kfrox4MGGfdY7k51tuG8a8MY5mnnrtuLmxbet6',
]);

const RESOLVED_CACHE: Record<string, string> = {};

async function resolvePidHash(pid: string): Promise<string | null> {
  if (pid.length < 40 || IGNORE_PIDS.has(pid)) return null;
  if (RESOLVED_CACHE[pid]) return RESOLVED_CACHE[pid];

  try {
    const { data } = await axios.get(
      `https://api.solana.fm/v0/programs/${pid}`,
      { timeout: 4000 }
    );
    const text = [
      data.name,
      data.project?.name,
      data.project?.description,
      data.description,
    ]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase())
      .join(' | ');

    let found: string | null = null;
    if (text.includes('jupiter')) found = 'Jupiter';
    if (text.includes('raydium')) found = 'Raydium';
    if (text.includes('orca')) found = 'Orca';

    if (found) {
      RESOLVED_CACHE[pid] = found;
      return found;
    }

    console.log('[resolver] unmapped →', pid, '=>', text);
    return null;
  } catch {
    return null;
  }
}

let lastSig: string | null = null;

export function subscribeTransactions(
  handler: (tx: ParsedTx) => Promise<void>
) {
  const poll = async () => {
    const sigInfos = await connection.getSignaturesForAddress(
      TOKEN_MINT,
      { limit: 100 }
    );
    const newSigs = lastSig
      ? sigInfos.filter((s) => s.signature !== lastSig)
      : sigInfos;

    if (sigInfos.length) {
      lastSig = sigInfos[0].signature;
    }

    for (const info of newSigs.reverse()) {
      const full = await connection.getParsedTransaction(
        info.signature,
        {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        }
      );
      if (!full?.transaction) continue;

      const wallet = full.transaction.message.accountKeys[0].pubkey.toBase58();
      const allInstr = [
        ...full.transaction.message.instructions,
        ...(full.meta?.innerInstructions || []).flatMap(
          (ii) => ii.instructions
        ),
      ] as (ParsedInstruction | PartiallyDecodedInstruction)[];

      const calls = allInstr.filter(
        (ix) => !IGNORE_PIDS.has(ix.programId.toBase58())
      );
      if (calls.length === 0) continue;

      let protocol: string | undefined;
      for (const ix of calls) {
        const pid = ix.programId.toBase58();
        if (PROTOCOL_IDS[pid]) {
          protocol = PROTOCOL_IDS[pid];
          break;
        }
        const dyn = await resolvePidHash(pid);
        if (dyn) {
          protocol = dyn;
          break;
        }
      }

      if (!protocol) {
        console.log(
          '[DEBUG PID]',
          calls.map((ix) => ix.programId.toBase58()).join(', ')
        );
        console.log(
          '[DEBUG TX]',
          info.signature.slice(0, 6),
          'protocol=unknown'
        );
        continue;
      }

      // --- delta calculation with safe defaults ---
      const pre = full.meta?.preTokenBalances || [];
      const post = full.meta?.postTokenBalances || [];
      let delta = 0;
      for (let i = 0; i < pre.length; i++) {
        const a = pre[i],
          b = post[i];
        if (
          a.owner === wallet &&
          a.mint === TOKEN_MINT.toBase58()
        ) {
          // coalesce uiAmountString to "0" if undefined
          const before = a.uiTokenAmount.uiAmountString ?? '0';
          const after = b.uiTokenAmount.uiAmountString ?? '0';
          delta = parseFloat(after) - parseFloat(before);
          break;
        }
      }

      const type: ParsedTx['type'] =
        delta > 0 ? 'buy' : delta < 0 ? 'sell' : 'swap';

      console.log(
        '[DEBUG TX]',
        info.signature.slice(0, 6),
        `Δ=${delta.toFixed(4)}`,
        `protocol=${protocol}`
      );

      await handler({
        signature: info.signature,
        timestamp: (full.blockTime || Date.now() / 1000) * 1000,
        wallet,
        amount: Math.abs(delta),
        type,
        protocol,
      });
    }
  };

  poll().catch(console.error);
  setInterval(() => poll().catch(console.error), 15_000);
}

export async function getTopHolders() {
  const resp = await retry(() =>
    connection.getTokenLargestAccounts(TOKEN_MINT)
  );
  return resp.value.slice(0, 60).map((v) => ({
    address: v.address.toBase58(),
    amount: v.uiAmount ?? 0,
  }));
}
