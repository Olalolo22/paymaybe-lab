/* PayMaybe Lab — design prototype.
   Real: the draw (crypto.getRandomValues, unbiased 0–9,999) and the tier math, which match the program.
   Simulated: wallet, balances, transaction IDs, network timing. Nothing links to an explorer. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- data
  const LAMPORTS = 1_000_000_000;
  const SHARD_VALUE_LAMPORTS = 100;

  const ICONS = {
    cup: '<path d="M14 24h30v14a13 13 0 0 1-13 13h-4a13 13 0 0 1-13-13z"/><path d="M44 28h4a6 6 0 0 1 0 12h-5"/><path d="M22 9c-2 3 2 5 0 8M30 9c-2 3 2 5 0 8M38 9c-2 3 2 5 0 8"/><path d="M10 57h40"/>',
    hoodie: '<path d="M22 9c2 6 18 6 20 0l10 6 7 17-8 4-3-7v28H16V29l-3 7-8-4 7-17z"/><path d="M26 11c0 9 12 9 12 0"/><path d="M23 43h18v7H23z"/><path d="M29 17v9M35 17v9"/>',
    ticket: '<path d="M7 17h50v9a6 6 0 0 0 0 12v9H7v-9a6 6 0 0 0 0-12z"/><path d="M41 17v30" stroke-dasharray="3 4"/><path d="M15 27h18M15 35h11"/>',
    box: '<path d="M7 22l25-10 25 10-25 10z"/><path d="M7 22v24l25 11 25-11V22"/><path d="M32 32v25"/><path d="M16 26.5l25-10"/>',
  };

  const ITEMS = [
    { id: 0, name: "Espresso Pass", icon: "cup", lamports: 20_000_000, desc: "A month of single-origin pours, redeemed at the counter." },
    { id: 1, name: "Founder Hoodie", icon: "hoodie", lamports: 50_000_000, desc: "Limited physical drop. Ships to your door." },
    { id: 2, name: "VIP Event Ticket", icon: "ticket", lamports: 100_000_000, desc: "Front-row seat, held in your wallet." },
    { id: 3, name: "Mystery Box", icon: "box", lamports: 150_000_000, desc: "A sealed collectible. Could be anything." },
  ];

  // Same ranges the program should use: roll in [0, 9999]
  const TIERS = {
    free:    { key: "free",    lo: 9900, hi: 9999, bps: 10000, shards: 10,  stamp: "Free",        sub: "full refund", mini: "Free" },
    half:    { key: "half",    lo: 9300, hi: 9899, bps: 5000,  shards: 25,  stamp: "50% off",     sub: "cashback",    mini: "50%" },
    quarter: { key: "quarter", lo: 7500, hi: 9299, bps: 2500,  shards: 50,  stamp: "25% off",     sub: "cashback",    mini: "25%" },
    none:    { key: "none",    lo: 0,    hi: 7499, bps: 0,     shards: 100, stamp: "+100 shards", sub: "thanks for shopping", mini: "+100" },
  };
  const tierOf = (roll) => Object.values(TIERS).find((t) => roll >= t.lo && roll <= t.hi);

  // ---------------------------------------------------------------- randomness
  function u32() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; }
  // Rejection sampling: no modulo bias (the byte % 100 in lib.rs is biased; this is the reference fix)
  function drawRoll() {
    const range = 10000, limit = 2 ** 32 - (2 ** 32 % range);
    let x; do { x = u32(); } while (x >= limit);
    return x % range;
  }
  function forcedRoll(key) { const t = TIERS[key]; return t.lo + (u32() % (t.hi - t.lo + 1)); }

  // ---------------------------------------------------------------- state
  const STORE_KEY = "paymaybe-lab-v1";
  const fresh = () => ({ connected: false, wallet: null, balance: 2 * LAMPORTS, claimable: 0, shards: 0, history: [], nextNo: 42 });
  let S = load();
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return { ...fresh(), ...JSON.parse(raw) }; } catch (e) { /* storage blocked */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }

  const demo = { force: "random", speed: 1 };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- utils
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sol = (l, d = 4) => (l / LAMPORTS).toFixed(d);
  const solShort = (l) => { const v = l / LAMPORTS; return (v >= 1 ? v.toFixed(2) : v.toFixed(3)).replace(/0+$/, "").replace(/\.$/, ""); };
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (n) => Array.from({ length: n }, () => B58[u32() % 58]).join("");
  const short = (s) => `${s.slice(0, 4)}…${s.slice(-4)}`;
  const fmtRoll = (n) => { const s = String(n).padStart(4, "0"); return `${s[0]},${s.slice(1)}`; };
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const fmtDate = (d) => `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}  ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * demo.speed));
  const CANCEL = Symbol("cancel");

  function toast(html) {
    const el = document.createElement("div");
    el.className = "toast"; el.innerHTML = html;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  // ---------------------------------------------------------------- reel
  function makeReel(el, str) {
    el.innerHTML = ""; el.setAttribute("role", "img"); el.setAttribute("aria-label", `${str} SOL`);
    const digits = [];
    for (const c of str) {
      const ch = document.createElement("span"); ch.className = "ch";
      if (/\d/.test(c)) {
        ch.classList.add("dig");
        const strip = document.createElement("span"); strip.className = "strip";
        strip.innerHTML = Array.from({ length: 20 }, (_, i) => `<span>${i % 10}</span>`).join("");
        strip.style.transform = `translateY(calc(var(--h) * -${+c}))`;
        ch.appendChild(strip); digits.push({ ch, strip });
      } else ch.textContent = c;
      el.appendChild(ch);
    }
    return {
      spin() { if (reduceMotion) return; digits.forEach((d) => { d.ch.classList.remove("land"); d.ch.classList.add("spin"); }); },
      async land(target, alive) {
        el.setAttribute("aria-label", `${target} SOL`);
        const t = [...target].filter((c) => /\d/.test(c)).map(Number);
        if (reduceMotion) { digits.forEach((d, i) => { d.strip.style.transform = `translateY(calc(var(--h) * -${t[i]}))`; }); return; }
        for (let i = 0; i < digits.length; i++) {
          const d = digits[i];
          d.ch.classList.remove("spin"); d.ch.classList.add("land");
          void d.strip.offsetWidth;
          d.strip.style.transform = `translateY(calc(var(--h) * -${10 + t[i]}))`;
          await wait(130); if (alive && !alive()) throw CANCEL;
        }
        await wait(700);
        digits.forEach((d, i) => { d.ch.classList.remove("land"); d.strip.style.transform = `translateY(calc(var(--h) * -${t[i]}))`; });
      },
    };
  }

  // ---------------------------------------------------------------- receipt
  function makeReceipt(host) {
    host.innerHTML = `<div class="printer"><div class="printer-slot"></div><div class="feed">
      <div class="receipt" role="group" aria-label="Receipt"><div class="r-body"></div><div class="stamp" aria-hidden="true"></div></div>
    </div></div>`;
    const receipt = $(".receipt", host), body = $(".r-body", host), stampEl = $(".stamp", host);
    const add = (el) => { if (!reduceMotion) el.classList.add("printing"); body.appendChild(el); return el; };
    const api = {
      token: 0,
      clear() { api.token++; body.innerHTML = ""; stampEl.className = "stamp"; stampEl.innerHTML = ""; receipt.classList.remove("thud"); return api.token; },
      text(html, cls = "") { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return add(d); },
      line(l, r, cls = "") {
        const d = document.createElement("div"); d.className = `r-line ${cls}`;
        d.innerHTML = `<span class="l">${l}</span><span class="fill" aria-hidden="true"></span><span class="r">${r}</span>`;
        return add(d);
      },
      setRight(line, html) { $(".r", line).innerHTML = html; },
      rule() { const h = document.createElement("hr"); h.className = "r-rule"; return add(h); },
      total(label, value) {
        const d = document.createElement("div"); d.className = "r-total";
        d.innerHTML = `<span class="l">${label}</span><span><span class="reel"></span> <span class="sol">SOL</span></span>`;
        add(d); return makeReel($(".reel", d), value);
      },
      barcode(seed) {
        let x = 0, bars = "";
        for (let i = 0; i < seed.length && x < 196; i++) {
          const v = B58.indexOf(seed[i]); const w = 1 + (v % 3); const gap = 1 + ((v >> 2) % 3);
          bars += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w + gap;
        }
        const d = document.createElement("div");
        d.innerHTML = `<svg class="barcode" viewBox="0 0 ${x} 40" preserveAspectRatio="none" aria-hidden="true">${bars}</svg><div class="r-center r-muted">${short(seed)}</div>`;
        return add(d);
      },
      stamp(tier) {
        stampEl.className = `stamp t-${tier.key}`;
        stampEl.innerHTML = `${tier.stamp}<small>${tier.sub}</small>`;
        void stampEl.offsetWidth; stampEl.classList.add("on");
        if (!reduceMotion) receipt.classList.add("thud");
      },
      // static "order" receipt before paying
      order(item, no) {
        api.clear();
        api.text("PAYMAYBE STORE", "r-center r-store");
        api.text(`SOLANA DEVNET  #${no}`, "r-center r-muted");
        api.text(fmtDate(new Date()), "r-center r-muted");
        api.rule();
        api.line(item.name.toUpperCase(), sol(item.lamports));
        api.text("INCLUDES 1 SPIN", "r-sub");
        api.rule();
        api.total("TOTAL DUE", sol(item.lamports));
      },
    };
    return api;
  }

  function decide(item, force) {
    const roll = force === "random" ? drawRoll() : forcedRoll(force);
    const tier = tierOf(roll);
    const rebate = Math.floor((item.lamports * tier.bps) / 10000);
    return { roll, tier, rebate, net: item.lamports - rebate, sigs: [b58(88), b58(88)] };
  }

  // Prints the full checkout, step by step. onStep(key, state, info)
  async function printSpin(rc, item, out, no, onStep = () => {}) {
    const tok = rc.clear();
    const alive = () => rc.token === tok;
    const t = async (ms) => { await wait(ms); if (!alive()) throw CANCEL; };

    rc.text("PAYMAYBE STORE", "r-center r-store");
    rc.text(`SOLANA DEVNET  #${no}`, "r-center r-muted");
    rc.text(fmtDate(new Date()), "r-center r-muted");
    rc.rule(); await t(220);
    rc.line(item.name.toUpperCase(), sol(item.lamports));
    rc.text("INCLUDES 1 SPIN", "r-sub");
    rc.rule(); await t(220);

    onStep("escrow", "active");
    const esc = rc.line("ESCROW", '<span class="r-wait"></span>');
    await t(1000);
    rc.setRight(esc, '<span class="r-ok">HELD</span>');
    rc.text(`TX ${short(out.sigs[0])}`, "r-sub");
    onStep("escrow", "done");

    onStep("sealed", "active");
    const sealed = rc.line("SESSION", '<span class="r-wait"></span>');
    await t(900);
    rc.setRight(sealed, '<span class="r-ok">PRIVATE</span>');
    rc.text("MAGICBLOCK PRIVATE ROLLUP", "r-sub");
    onStep("sealed", "done");

    onStep("roll", "active");
    const rollLine = rc.line("VRF ROLL", '<span class="scr">----</span>');
    rc.rule();
    const reel = rc.total("YOU PAY", sol(item.lamports));
    await t(250);
    reel.spin();
    const scr = $(".scr", rollLine);
    const until = performance.now() + (reduceMotion ? 0 : 1500 * demo.speed);
    while (performance.now() < until) { scr.textContent = fmtRoll(u32() % 10000); await t(55); }
    scr.textContent = fmtRoll(out.roll);
    onStep("roll", "done", out);

    onStep("settle", "active");
    await reel.land(sol(out.net), alive);
    if (!alive()) throw CANCEL;
    if (out.rebate > 0) rc.line("CASHBACK", sol(out.rebate));
    rc.line("SHARDS", `+${out.tier.shards}`);
    const settle = rc.line("SETTLED", '<span class="r-wait"></span>');
    rc.barcode(out.sigs[1]);
    await t(150);
    rc.stamp(out.tier);
    await t(700);
    rc.setRight(settle, '<span class="r-ok">SOLANA</span>');
    onStep("settle", "done", out);
  }

  // ---------------------------------------------------------------- wallet chrome
  function paintWallet() {
    const b = $("#walletBtn");
    if (S.connected) {
      b.classList.add("is-on");
      b.innerHTML = `<span>${short(S.wallet)}</span><span class="bal">${solShort(S.balance)} SOL</span>`;
      b.setAttribute("aria-label", `Demo wallet ${short(S.wallet)}, ${solShort(S.balance)} SOL. Open vault.`);
    } else {
      b.classList.remove("is-on"); b.textContent = "Connect wallet"; b.removeAttribute("aria-label");
    }
  }
  function connect() {
    if (S.connected) return;
    S.connected = true; S.wallet = b58(44); save(); paintWallet();
    toast(`<b>DEMO WALLET CONNECTED</b><br>${short(S.wallet)}<br>2.00 DEVNET SOL`);
  }
  $("#walletBtn").addEventListener("click", () => { if (S.connected) location.hash = "#/vault"; else connect(); });

  // ---------------------------------------------------------------- shop
  function renderShelf() {
    $("#tags").innerHTML = ITEMS.map((it) => `
      <li><article class="tag" aria-labelledby="tag-${it.id}">
        <svg class="tag-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[it.icon]}</svg>
        <h3 id="tag-${it.id}">${it.name}</h3>
        <p>${it.desc}</p>
        <p class="tag-price">${solShort(it.lamports)} <small>SOL</small></p>
        <a class="btn btn-key" href="#/checkout/${it.id}">Buy and spin</a>
      </article></li>`).join("");
  }
  $('a[href="#shelf"]').addEventListener("click", (e) => { e.preventDefault(); $("#shelf").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); });

  const hero = makeReceipt($("#heroReceipt"));
  let heroPlayed = false;
  async function playHero() {
    heroPlayed = true;
    const item = ITEMS[3];
    const out = decide(item, "free");
    try { await wait(500); await printSpin(hero, item, out, "0001"); } catch (e) { if (e !== CANCEL) throw e; }
  }
  $("#heroReplay").addEventListener("click", playHero);

  // ---------------------------------------------------------------- checkout
  const ck = { rc: makeReceipt($("#checkoutReceipt")), item: null, out: null, no: null, busy: false };

  function setStep(key, state) {
    const li = $(`#steps [data-step="${key}"]`); if (!li) return;
    li.classList.remove("active", "done"); if (state) li.classList.add(state);
  }
  function paintCarbon(stage) {
    const it = ck.item, out = ck.out;
    $("#carbonYours").textContent =
`getAccountInfo(buyer)
→ BuyerAccount {
  buyer: ${short(S.wallet || b58(44))}
  item: ${it.name}
  pending: ${sol(it.lamports)} SOL
  spin_state: ${stage === "done" ? "Resolved" : "PendingVrf"}${stage === "done" ? `\n  roll: ${fmtRoll(out.roll)}` : ""}
}`;
    $("#carbonStranger").textContent =
`getAccountInfo(buyer)
→ null

Account is private
while the spin runs.`;
  }
  function paintPay() {
    const it = ck.item, btn = $("#payBtn"), note = $("#payNote");
    note.classList.remove("err");
    if (!S.connected) { btn.textContent = "Connect demo wallet"; note.textContent = "No extension needed. The demo wallet starts with 2 devnet SOL."; return; }
    btn.textContent = `Pay ${solShort(it.lamports)} SOL and spin`;
    if (S.balance < it.lamports) {
      btn.disabled = true; note.classList.add("err");
      note.textContent = `Your demo wallet has ${sol(S.balance)} SOL, not enough for this. Reset it from Demo controls.`;
    } else { btn.disabled = false; note.textContent = `Demo wallet ${short(S.wallet)} has ${solShort(S.balance)} SOL.`; }
  }
  function openCheckout(id) {
    const it = ITEMS[id];
    if (!it) { location.hash = "#/"; return; }
    ck.item = it; ck.out = null; ck.busy = false; ck.no = String(S.nextNo).padStart(4, "0");
    $("#h-checkout").textContent = it.name;
    $("#checkoutSub").textContent = `You pay ${solShort(it.lamports)} SOL now. Your spin decides how much comes back.`;
    $("#payBox").hidden = false; $("#result").hidden = true; $("#carbon").hidden = true; $("#strangerBtn").hidden = true;
    $("#strangerBtn").setAttribute("aria-expanded", "false");
    ["escrow", "sealed", "roll", "settle"].forEach((k) => setStep(k, null));
    ck.rc.order(it, ck.no);
    paintPay();
  }
  $("#payBtn").addEventListener("click", async () => {
    if (!S.connected) { connect(); paintPay(); return; }
    const it = ck.item; if (ck.busy || S.balance < it.lamports) return;
    ck.busy = true;
    // Settle the state first, like the chain would; the receipt then replays it.
    const out = decide(it, demo.force);
    ck.out = out;
    S.balance -= it.lamports; S.claimable += out.rebate; S.shards += out.tier.shards; S.nextNo += 1;
    S.history.unshift({ no: ck.no, item: it.id, roll: out.roll, tier: out.tier.key, price: it.lamports, rebate: out.rebate, at: Date.now() });
    S.history = S.history.slice(0, 40);
    save(); paintWallet();
    $("#payBox").hidden = true;
    if (innerWidth < 860) $("#checkoutReceipt").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    try {
      await printSpin(ck.rc, it, out, ck.no, (key, state) => {
        setStep(key, state);
        if (key === "sealed" && state === "done") { $("#strangerBtn").hidden = false; paintCarbon("pending"); }
        if (key === "settle" && state === "done") { paintCarbon("done"); showResult(); }
      });
    } catch (e) { if (e !== CANCEL) throw e; }
    ck.busy = false;
  });
  $("#strangerBtn").addEventListener("click", (e) => {
    const c = $("#carbon"); c.hidden = !c.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!c.hidden));
    e.currentTarget.textContent = c.hidden ? "Compare with a stranger's view" : "Hide the comparison";
  });
  function showResult() {
    const { tier, rebate } = ck.out;
    const lines = {
      free: `Free. All ${sol(rebate)} SOL is waiting in your vault.`,
      half: `Half back. ${sol(rebate)} SOL is waiting in your vault.`,
      quarter: `A quarter back. ${sol(rebate)} SOL is waiting in your vault.`,
      none: `No cashback this time. You earned ${tier.shards} shards.`,
    };
    $("#resultLine").textContent = lines[tier.key];
    $("#resultPrimary").textContent = rebate > 0 ? "Claim in vault" : "See your shards";
    $("#result").hidden = false;
  }

  // ---------------------------------------------------------------- vault
  function renderVault() {
    $("#cashAmount").textContent = sol(S.claimable);
    const wins = S.history.filter((h) => h.rebate > 0).length;
    $("#cashNote").textContent = S.claimable > 0 ? `From ${wins} winning spin${wins === 1 ? "" : "s"}. Claiming sends it to your wallet.` : "Nothing to claim yet. Cashback from a winning spin lands here.";
    $("#claimBtn").disabled = S.claimable === 0;

    $("#shardCount").textContent = S.shards.toLocaleString("en-US");
    const stack = $("#chipStack");
    if (S.shards === 0) stack.innerHTML = '<p class="chip-empty">No shards yet. Every spin earns some.</p>';
    else {
      const chips = Math.min(80, Math.ceil(S.shards / 10));
      let html = "";
      for (let c = 0; c < Math.ceil(chips / 10); c++) {
        const n = Math.min(10, chips - c * 10);
        html += `<div class="chip-col">${"<i></i>".repeat(n)}</div>`;
      }
      stack.innerHTML = html;
    }
    const range = $("#sellRange"), max = Math.floor(S.shards / 10) * 10;
    range.max = String(max); range.value = String(max); range.disabled = max === 0;
    paintSell();

    const stubs = $("#stubs");
    if (!S.history.length) stubs.innerHTML = '<li class="stubs-empty">No receipts yet. Your checkouts will collect here.</li>';
    else stubs.innerHTML = S.history.slice(0, 12).map((h) => {
      const t = TIERS[h.tier], it = ITEMS[h.item], d = new Date(h.at);
      return `<li class="stub"><span class="mini-stamp t-${t.key}">${t.mini}</span>
        <b>#${h.no}</b><br>${it.name.toUpperCase()}<br>ROLL ${fmtRoll(h.roll)}<br>PAID ${sol(h.price - h.rebate)} SOL<br><span class="r-muted">${fmtDate(d)}</span></li>`;
    }).join("");
  }
  function paintSell() {
    const q = +$("#sellRange").value;
    $("#sellQty").textContent = q.toLocaleString("en-US");
    $("#sellValue").textContent = sol(q * SHARD_VALUE_LAMPORTS, 7);
    $("#sellBtn").disabled = q === 0;
  }
  $("#sellRange").addEventListener("input", paintSell);
  $("#claimBtn").addEventListener("click", () => {
    if (!S.claimable) return;
    const amt = S.claimable; S.balance += amt; S.claimable = 0; save(); paintWallet(); renderVault();
    toast(`<b>CASHBACK CLAIMED</b><br>${sol(amt)} SOL<br>TX ${short(b58(88))}`);
  });
  $("#sellBtn").addEventListener("click", () => {
    const q = +$("#sellRange").value; if (!q || q > S.shards) return;
    S.shards -= q; S.balance += q * SHARD_VALUE_LAMPORTS; save(); paintWallet(); renderVault();
    toast(`<b>SHARDS SOLD</b><br>${q} × 100 LAMPORTS<br>+${sol(q * SHARD_VALUE_LAMPORTS, 7)} SOL`);
  });

  // ---------------------------------------------------------------- fair play
  function renderFair() {
    const marks = $("#stripMarks");
    const rolls = S.history.slice(0, 30);
    marks.innerHTML = rolls.map((h, i) => `<span class="${i === 0 ? "last" : ""}" style="left:${(h.roll / 9999) * 100}%"></span>`).join("");
    if (rolls.length) {
      const last = rolls[0], t = TIERS[last.tier];
      const what = { free: "free", half: "half back", quarter: "25% back", none: "shards only" }[t.key];
      $("#stripLegend").textContent = `Your last roll was ${fmtRoll(last.roll)} (${what}). Yellow marks it; white marks your earlier ${rolls.length - 1 === 1 ? "roll" : "rolls"}.`;
      if (rolls.length === 1) $("#stripLegend").textContent = `Your last roll was ${fmtRoll(last.roll)} (${what}).`;
    } else $("#stripLegend").textContent = "Your rolls show up here as you check out.";
  }

  // ---------------------------------------------------------------- demo controls
  const fab = $("#demoFab"), sheet = $("#demoSheet");
  fab.addEventListener("click", () => { sheet.hidden = !sheet.hidden; fab.setAttribute("aria-expanded", String(!sheet.hidden)); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) { sheet.hidden = true; fab.setAttribute("aria-expanded", "false"); fab.focus(); } });
  $$('input[name="force"]').forEach((r) => r.addEventListener("change", () => { demo.force = r.value; }));
  $$('input[name="speed"]').forEach((r) => r.addEventListener("change", () => { demo.speed = +r.value; }));
  $("#resetBtn").addEventListener("click", () => {
    S = fresh(); save(); paintWallet(); route();
    toast("<b>DEMO RESET</b><br>WALLET DISCONNECTED<br>RECEIPTS CLEARED");
  });

  // ---------------------------------------------------------------- router
  function show(view) {
    $$(".view").forEach((v) => { v.hidden = v.dataset.view !== view; });
    $$(".nav a").forEach((a) => { if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  }
  function route() {
    const h = location.hash.replace(/^#/, "") || "/";
    const m = h.match(/^\/checkout\/(\d+)$/);
    if (!m) ck.rc.token++; // leaving checkout cancels a print in progress
    if (m) { show("/checkout"); openCheckout(+m[1]); }
    else if (h === "/vault") { show("/vault"); renderVault(); }
    else if (h === "/fair") { show("/fair"); renderFair(); }
    else { show("/"); if (!heroPlayed) playHero(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  renderShelf(); paintWallet(); route();
})();
