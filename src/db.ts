

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';         
import { ParsedTx } from './solana';

export async function initDb(filePath: string): Promise<Database> {
  const db = await open({
    filename: filePath,
    driver: sqlite3.Database,
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT UNIQUE,
      timestamp INTEGER,
      wallet TEXT,
      amount REAL,
      type TEXT,
      protocol TEXT
    );
  `);
  return db;
}

export async function insertTransaction(
  db: Database,
  tx: ParsedTx
): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO transactions
      (signature, timestamp, wallet, amount, type, protocol)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tx.signature, tx.timestamp, tx.wallet, tx.amount, tx.type, tx.protocol]
  );
}

export async function getSummary(
  db: Database
): Promise<{
  buys: number;
  sells: number;
  protocol: { protocol: string; count: number }[];
}> {
  const rowBuys = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM transactions WHERE type='buy'`
  );
  const rowSells = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM transactions WHERE type='sell'`
  );
  const buys  = rowBuys?.count  ?? 0;
  const sells = rowSells?.count ?? 0;

  const raw = await db.all(
    `SELECT protocol, COUNT(*) as count
       FROM transactions
      GROUP BY protocol`
  );
  const protocolRows = Array.isArray(raw)
    ? (raw as { protocol: string; count: number }[])
    : [];

  return { buys, sells, protocol: protocolRows };
}
