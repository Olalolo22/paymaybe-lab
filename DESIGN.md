# PayMaybe design spec: "the receipt is the slot machine"

This is the design reference for the PayMaybe frontend. Port it into `paymaybe/frontend` (Next.js + Tailwind). Every class and token below also exists in `styles.css`.

## Principles

1. **The receipt is the machine.** Every chain step is a printed line on the receipt. Don't put a spinning wheel in a modal.
2. **One dramatic moment:** the stamp. Everything else stays quiet: no confetti, no glow, no per-card entrance animations.
3. **Plain words first, tech second.** "Payment held", then "SOL escrowed in the store vault on Solana".
4. **Honest numbers.** Show the real odds (1 / 6 / 18 / 75) and never claim a privacy check you didn't run.
5. **Mobile first.** On phones the receipt comes before the step list during checkout.

## Tokens

| Token | Hex | Use |
| --- | --- | --- |
| `felt` | `#0E4A38` | page (the counter) |
| `felt-deep` | `#0A3A2C` | top bar, footer |
| `chalk` / `chalk-soft` | `#E9F2EC` / `#A9C2B6` | text on felt |
| `paper` | `#F6F5EF` | receipts, tags, slips |
| `ink` / `ink-soft` | `#2E2B63` / `#6C69A0` | thermal print on paper |
| `stamp` | `#D7263D` | cashback stamps |
| `key` / `key-edge` | `#FFD23F` / `#C99A12` | primary actions (till keys), FREE |
| `shard` / `shard-ink` | `#36C5F0` / `#137FAA` | shards everywhere |

Tailwind: replace the `pm` palette in `tailwind.config.ts` with these names.

**Type** (load with `next/font/google`):

- **Big Shoulders Display** 700–900: headlines, prices, buttons, stamps.
- **Hanken Grotesk** 400–700: UI and body text.
- **Martian Mono** (width 87.5): only inside receipts, stubs and toasts. Monospace is the receipt's material, not a style for labels.

## Component map (prototype → Next.js repo)

| Prototype | Replaces | Notes |
| --- | --- | --- |
| `.hero` + hero receipt | header + hero in `app/page.tsx` | Hero receipt prints a FREE roll once on load, with the caption "1 checkout in 100". |
| `.tags` / `.tag` | `StorefrontSection.tsx` | Price tags hang from a rail. The tilt alternates. Hover swings them (pointer devices only). |
| `#/checkout/:id` page | `SpinModal.tsx` | Make it a route (`app/checkout/[id]/page.tsx`), not a modal. It needs room, and it gives you a shareable URL. |
| `.steps` | step list inside `SpinModal` | States: pending / active (yellow ping) / done. |
| `.carbon` | "Verify privacy" `<pre>` | Two copies side by side. **Wire it to real reads** (see below). |
| `#/vault` | `VaultDrawer.tsx` | Make it a page. The slip is cashback, the chip stack is shards, the stubs are history. |
| `#/fair` | new | Number line plus your rolls. Good for judges. |

## Checkout phases → `usePayMaybe`

The prototype's `printSpin()` follows the phases already in `usePayMaybe.ts`:

| Receipt line | Hook phase | Real source |
| --- | --- | --- |
| `ESCROW .... HELD` + `TX` | `escrowing` | `deposit_checkout` signature |
| `SESSION .... PRIVATE` | `delegating` → `privacy` | `delegate_buyer` (L1), then the first ER tx |
| `VRF ROLL .... 9,412` | `spinning` | `SpinResolved.roll` event, or poll `BuyerAccount` on the ER |
| reel lands on `YOU PAY` | `revealing` | `price - rebate_lamports` |
| `SETTLED .... SOLANA` + barcode + stamp | `done` | `commit_and_undelegate_buyer` → L1 commitment sig |

While waiting on the oracle, keep the reel spinning (`.dig.spin`), then land it when the event arrives. The reel needs a fixed-width string, so always format SOL with 4 decimals.

## Roll → tier (must match the program)

```
roll = u64_from_le(randomness[0..8]) % 10_000      // or rejection-sample to remove bias
9,900–9,999  FREE     10,000 bps  10 shards
9,300–9,899  HALF      5,000 bps  25 shards
7,500–9,299  QUARTER   2,500 bps  50 shards
0–7,499      NONE          0 bps 100 shards
```

If the program changes its ranges, update `TIERS` in `js/app.js` and the strip on Fair play.

## Stranger's copy: make it real

Read the buyer PDA, derived with **both** seeds (`buyer`, `store_vault`, `wallet`), from:

1. the ER endpoint **with** the session token → render "Your copy" from the decoded account;
2. the same endpoint **without** auth → render "A stranger's copy". Show `null` only if that call actually returned `null`. If it errors, show the error. Never print "verified" from a catch block.

## Motion

- Print head: each new line wipes in left to right (`.printing`, 220 ms, `steps(10)`).
- Reel: digits blur-spin while the roll is pending, then land left to right, 130 ms apart, with a slight overshoot.
- Stamp: lands from 2.1× scale with a tilt, and the receipt gives a small thud.
- `prefers-reduced-motion`: no print wipe, no spin, no stamp scale. Final values appear immediately.

## Copy rules

- Actions say what happens: "Pay 0.1 SOL and spin", "Claim cashback", "Sell shards".
- Use sentence case everywhere except printed receipt text and stamps, which are uppercase because that's how those objects look.
- Empty states tell you what to do: "No receipts yet. Your checkouts will collect here."
