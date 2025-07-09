import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedConfirmedTransaction,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  ParsedMessageAccount,
  TokenBalance,
} from '@solana/web3.js';

/* ────────────── persisted Tx shape ───────────────────── */
export interface ParsedTx {
  signature: string;
  timestamp: number;
  wallet: string;
  amount: number;
  type: 'buy' | 'sell' | 'swap' | 'unknown';
  protocol: string;
}

/* ────────────── RPC connection ───────────────────────── */
const RPC_ENDPOINT =
  process.env.RPC_ENDPOINT ||
  'https://api.mainnet-beta.solana.com';

const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
});

/* ────────────── small helpers ────────────────────────── */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  tries = 5,
  delay = 500,
): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (tries && e.message?.includes('429')) {
      await sleep(delay);
      return withRetry(fn, tries - 1, delay * 2);
    }
    throw e;
  }
}

const pkToStr = (k: PublicKey | ParsedMessageAccount) =>
  k instanceof PublicKey ? k.toBase58() : k.pubkey.toBase58();

const zip = <A, B>(a: A[], b: B[]) => a.map((x, i) => [x, b[i]] as [A, B]);

/* ────────────── constants ─────────────────────────────── */
const TOKEN_MINT = new PublicKey(
  '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump',
);

const PROTOCOL_IDS: Record<string, string> = {
  /* Jupiter */
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: 'Jupiter',
  JUP2jxv1k2kFzAb4E4SDoz32WEEeR7J5iYjD4npCXE1: 'Jupiter',
  /* Raydium */
  RVKd61ztZW9DpoGJU9kBX9Z2zm2cn13FMvxRKv2cxv5: 'Raydium',
  EhhTKz6NmQHP7nP9oTaqmZjmnENPJwT2oZrBoC2Q6Bif: 'Raydium',
  /* Orca */
  '9WwGbnrthYgW5d5RMJ4WRv19y1tr9Gg9V1paXHUrvGQg': 'Orca',
  '49BLuDCCN5RiKcd8RoEJ9Q7ajQQLBM8yT9uEjFj7yUQh': 'Orca',
};

/* helper: safe programId for both instruction kinds */
const getProgramId = (
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): string => ix.programId.toBase58();

/* ────────────── top-60 holder helper (optional) ──────── */
export async function getTopHolders() {
  const resp = await withRetry(() =>
    connection.getTokenLargestAccounts(TOKEN_MINT),
  );
  return resp.value.slice(0, 60).map((v) => ({
    address: v.address.toBase58(),
    amount: v.uiAmount ?? 0,
  }));
}

/* ────────────── live subscription ────────────────────── */
let lastSeenSig: string | null = null;

export function subscribeTransactions(
  handler: (tx: ParsedTx) => Promise<void>,
) {
  async function poll(): Promise<void> {
    const sigInfos: ConfirmedSignatureInfo[] =
      await connection.getSignaturesForAddress(TOKEN_MINT, { limit: 100 });

    const newInfos = lastSeenSig
      ? sigInfos.filter((s) => s.signature !== lastSeenSig)
      : sigInfos;

    if (sigInfos.length) lastSeenSig = sigInfos[0].signature;

    for (const info of newInfos.reverse()) {
      try {
        const full = await connection.getParsedTransaction(info.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (!full?.transaction) continue;

        /* wallet = first message key */
        const wallet = pkToStr(full.transaction.message.accountKeys[0]);

        /* ── protocol detection */
        const allInstr = [
          ...full.transaction.message.instructions,
          ...(full.meta?.innerInstructions ?? []).flatMap(
            (ii) => ii.instructions,
          ),
        ] as (ParsedInstruction | PartiallyDecodedInstruction)[];

        let protocol = 'unknown';
        for (const ix of allInstr) {
          const pid = getProgramId(ix);
          if (PROTOCOL_IDS[pid]) {
            protocol = PROTOCOL_IDS[pid];
            break;
          }
        }
        console.log(`[protocol] ${info.signature.slice(0,6)}… => ${protocol}`);


        /* ── token delta */
        const pre = full.meta?.preTokenBalances ?? [];
        const post = full.meta?.postTokenBalances ?? [];
        let delta = 0;
        for (const [a, b] of zip(pre, post)) {
          if (
            a &&
            b &&
            a.owner === wallet &&
            a.mint === TOKEN_MINT.toBase58()
          ) {
            delta =
              parseFloat(b.uiTokenAmount?.uiAmountString ?? '0') -
              parseFloat(a.uiTokenAmount?.uiAmountString ?? '0');
            break;
          }
        }
        const txType: ParsedTx['type'] =
          delta > 0 ? 'buy' : delta < 0 ? 'sell' : 'swap';

        await handler({
          signature: info.signature,
          timestamp:
            (full.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
          wallet,
          amount: Math.abs(delta),
          type: txType,
          protocol,
        });
      } catch (err: any) {
        if (!err.message?.includes('maxSupportedTransactionVersion')) {
          console.error('[solana.ts] error:', err);
        }
      }
    }
  }

  poll().catch(console.error);
  setInterval(() => poll().catch(console.error), 15_000);
}
