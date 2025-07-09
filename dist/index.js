"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const solana_1 = require("./solana");
const db_1 = require("./db");
const PORT = parseInt(process.env.PORT || '3000', 10);
async function main() {
    const db = await (0, db_1.initDb)(path_1.default.resolve(__dirname, '../tokenwise.db'));
    try {
        const holders = await (0, solana_1.getTopHolders)();
        console.log(`Top holders fetched: ${holders.map((h) => h.address).join(', ')}`);
    }
    catch (err) {
        console.warn('Warning: getTopHolders failed:', err.message || err);
    }
    (0, solana_1.subscribeTransactions)(async (tx) => {
        try {
            await (0, db_1.insertTransaction)(db, tx);
            console.log(`✓ Inserted ${tx.signature}`);
        }
        catch (e) {
            console.error('Insert failed:', e);
        }
    });
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use(express_1.default.static(path_1.default.resolve(__dirname, '../public')));
    app.get('/api/summary', async (_req, res) => {
        try {
            res.json(await (0, db_1.getSummary)(db));
        }
        catch (e) {
            console.error('/api/summary error:', e);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
    app.get('/api/holders', async (_req, res) => {
        try {
            res.json(await (0, solana_1.getTopHolders)());
        }
        catch (e) {
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
