# PayMaybe Lab

**Buy now. Pay maybe.** The UI/UX prototype for PayMaybe, a Solana Blitz v10 (Entertainment Finance) entry.

Every checkout comes with one provably fair spin. It can return 25%, half or all of the price, and every spin earns shards. This repo is the **design reference**. The production build lives in `paymaybe` (Anchor program + Next.js), and `DESIGN.md` explains how to port this design into it.

## The idea in one line

**The receipt is the slot machine.** Checkout prints a thermal receipt, and each on-chain step prints as its own line. The total is an odometer reel that spins and lands on what you actually pay. Then a rubber stamp comes down: FREE, 50% OFF, 25% OFF or +100 SHARDS.

## Screens

| Route | What it shows |
| --- | --- |
| `#/` | **Shop**: hero receipt that prints a free roll, the shelf of price tags, and the four-step flow |
| `#/checkout/:id` | **Checkout**: order receipt, pay, live print with escrow → private session → VRF roll → settle, reel + stamp, and a "stranger's copy" privacy comparison |
| `#/vault` | **Vault**: cashback slip (claim), shard chip stack (sell), and your receipt stubs |
| `#/fair` | **Fair play**: the 0–9,999 number line with your rolls marked, the odds table, and what's real |

## What is real and what is simulated

- **Real:** the draw. It uses `crypto.getRandomValues` with rejection sampling (no modulo bias) and maps 0–9,999 to the same tiers the program uses: 9,900+ free, 9,300+ half, 7,500+ quarter, else shards.
- **Simulated:** the wallet, balances, transaction IDs and network timing. Nothing links to an explorer.
- State lives in `localStorage` for this browser only.

## Demo controls

There's a button at the bottom left for recording the video. It forces the next roll (free / half / quarter / shards), switches to fast pace, and resets the demo wallet. It is not part of the product.

## Run

No build step and no dependencies.

```bash
python3 -m http.server 8000   # or: npx serve .
```

**Vercel:** import the repo → Framework preset **Other** → leave the build command empty → Deploy.

## Files

```
index.html     all four screens (hash-routed sections)
styles.css     tokens + components
js/app.js      router, receipt printer, odometer reel, stamp, vault, fair play, demo controls
DESIGN.md      design spec + port guide for the Next.js frontend
favicon.svg
```
