import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import {
  getTopHolders,
  subscribeTransactions,
  ParsedTx,
} from './solana';
import {
  initDb,
  insertTransaction,
  getSummary,
} from './db';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main(): Promise<void> {
  const db = await initDb(path.resolve(__dirname, '../tokenwise.db'));

  try {
    const holders = await getTopHolders();
    console.log(
      `Top holders fetched: ${holders.map((h) => h.address).join(', ')}`
    );
  } catch (err: any) {
    console.warn('Warning: getTopHolders failed:', err.message || err);
  }

  subscribeTransactions(async (tx: ParsedTx) => {
    try {
      await insertTransaction(db, tx);
      console.log(`✓ Inserted ${tx.signature}`);
    } catch (e) {
      console.error('Insert failed:', e);
    }
  });

  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '../public')));

  app.get('/api/summary', async (_req: Request, res: Response) => {
    try {
      res.json(await getSummary(db));
    } catch (e) {
      console.error('/api/summary error:', e);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/holders', async (_req, res) => {
    try {
      res.json(await getTopHolders());
    } catch (e) {
      console.error('/api/holders error:', e);
      res.status(500).json({ error: 'Failed to fetch holders' });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
