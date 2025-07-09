// import { Database } from 'sqlite';
// import { Parser } from 'json2csv';

// export interface TxRow {
//   timestamp: number;
//   wallet: string;
//   amount: number;
//   type: string;
//   protocol: string;
// }

// /** Pulls rows, optionally filtered by query params */
// export async function fetchTxRows(
//   db: Database,
//   opts: { from?: number; to?: number; wallet?: string } = {},
// ): Promise<TxRow[]> {
//   const where: string[] = [];
//   const args: any[] = [];

//   if (opts.from) { where.push('timestamp >= ?'); args.push(opts.from); }
//   if (opts.to)   { where.push('timestamp <= ?'); args.push(opts.to); }
//   if (opts.wallet) { where.push('wallet = ?'); args.push(opts.wallet); }

//   const sql = `
//     SELECT timestamp, wallet, amount, type, protocol
//       FROM transactions
//      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
//      ORDER BY timestamp DESC
//   `;
//   return db.all<TxRow[]>(sql, args);
// }

// export function rowsToCsv(rows: TxRow[]): string {
//   const parser = new Parser({
//     fields: ['timestamp', 'wallet', 'amount', 'type', 'protocol'],
//   });
//   return parser.parse(rows);
// }
