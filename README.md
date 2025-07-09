# TokenWise – Real-Time Wallet Intelligence on Solana

TokenWise tracks the **top 60 holders** of any SPL token, streams their
buy/sell activity live, labels which DEX they used (Jupiter / Raydium / Orca),
and surfaces insights on a zero-friction dashboard.

## ✨ Features
 **Live polling** every 15 s (fallback exponential back-off on 429s)
 **Self-learning protocol map** – first unknown router is auto-resolved via
  SolanaFM, cached thereafter; built-ins are ignored
 **SQLite** for simplicity (swap for Postgres in 5 min)
 **Express REST**  
  • `/api/holders` → 60 latest largest accounts  
  • `/api/insights` → buys, sells, protocol counts, active wallets
 **Chart.js dashboard** – pie, protocol bars, top-10 bar, 60-row table

## 🚀 Quick setup


npm install           # installs TS + axios + sqlite
npm run build         # tsc → dist/
npm start             # ==> http://localhost:3000
