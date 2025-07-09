"use strict";
// backend/src/db.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSummary = exports.insertTransaction = exports.initDb = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite"); // <-- Make sure Database is imported
async function initDb(filePath) {
    const db = await (0, sqlite_1.open)({
        filename: filePath,
        driver: sqlite3_1.default.Database,
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
exports.initDb = initDb;
async function insertTransaction(db, tx) {
    await db.run(`INSERT OR IGNORE INTO transactions
      (signature, timestamp, wallet, amount, type, protocol)
     VALUES (?, ?, ?, ?, ?, ?)`, [tx.signature, tx.timestamp, tx.wallet, tx.amount, tx.type, tx.protocol]);
}
exports.insertTransaction = insertTransaction;
async function getSummary(db) {
    const rowBuys = await db.get(`SELECT COUNT(*) as count FROM transactions WHERE type='buy'`);
    const rowSells = await db.get(`SELECT COUNT(*) as count FROM transactions WHERE type='sell'`);
    const buys = rowBuys?.count ?? 0;
    const sells = rowSells?.count ?? 0;
    const raw = await db.all(`SELECT protocol, COUNT(*) as count
       FROM transactions
      GROUP BY protocol`);
    const protocolRows = Array.isArray(raw)
        ? raw
        : [];
    return { buys, sells, protocol: protocolRows };
}
exports.getSummary = getSummary;
