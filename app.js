(function () {
  "use strict";

  const STORAGE_KEY = "vkp-cc-tracker:v2";
  const LEGACY_KEY = "vkp-cc-tracker:v1";
  const DAY_MS = 86400000;
  const cards = Array.isArray(window.CARDS) ? window.CARDS : [];

  const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
  const money = (n) => (Number.isInteger(Math.round(n * 100) / 100) ? inrWhole : inrPaise).format(n);
  const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
  const fullDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
  const shortMonth = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });

  /* ---------- Dates & months ---------- */

  function today() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }

  function monthKeyOf(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function monthFromKey(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }

  function shiftMonth(key, delta) {
    const d = monthFromKey(key);
    d.setMonth(d.getMonth() + delta);
    return monthKeyOf(d);
  }

  function parseDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function daysUntil(date) {
    return Math.round((date - today()) / DAY_MS);
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  /*
   * Storage: { months: { "YYYY-MM": { cardId: { amount, dueDate, paid, updatedAt } } } }
   * `updatedAt` (ms) lets Drive sync merge per card+month: the newer edit wins. Cleared entries are kept
   * (empty values + timestamp) so a clear on one device isn't undone by older data from another.
   */

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && typeof data.months === "object" && data.months) return data;
    } catch {
      /* fall through */
    }
    const fresh = { months: {} };
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (legacy && typeof legacy === "object") {
        fresh.months[monthKeyOf(today())] = legacy;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch {
      /* ignore unreadable legacy data */
    }
    return fresh;
  }

  let state = load();

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function entry(month, id) {
    const e = (state.months[month] || {})[id] || {};
    return {
      amount: typeof e.amount === "string" ? e.amount : "",
      dueDate: typeof e.dueDate === "string" ? e.dueDate : "",
      paid: e.paid === true,
    };
  }

  function update(month, id, patch) {
    const next = Object.assign(entry(month, id), patch, { updatedAt: Date.now() });
    (state.months[month] || (state.months[month] = {}))[id] = next;
    save();
    if (window.DriveSync) DriveSync.schedule();
  }

  function mergeStates(a, b) {
    const out = { months: {} };
    for (const src of [a, b]) {
      const months = (src && src.months) || {};
      for (const month of Object.keys(months)) {
        const bucket = months[month] || {};
        for (const id of Object.keys(bucket)) {
          const e = bucket[id];
          if (!e || typeof e !== "object") continue;
          const cur = out.months[month] && out.months[month][id];
          if (!cur || (Number(e.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) {
            (out.months[month] || (out.months[month] = {}))[id] = e;
          }
        }
      }
    }
    return out;
  }

  function normaliseAmount(raw) {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : "";
  }

  function amountOf(e) {
    const n = parseFloat(e.amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function statusOf(e) {
    if (e.paid) return { tone: "paid", label: "Paid" };
    const due = parseDate(e.dueDate);
    if (!due) return { tone: "idle", label: e.amount ? "No due date" : "Not set" };
    const n = daysUntil(due);
    if (n < 0) return { tone: "overdue", label: "Overdue " + plural(-n, "day") };
    if (n === 0) return { tone: "urgent", label: "Due today" };
    if (n === 1) return { tone: "urgent", label: "Due tomorrow" };
    if (n <= 5) return { tone: "soon", label: "Due in " + n + " days" };
    return { tone: "ok", label: "Due in " + n + " days" };
  }

  /* ---------- Card facts (limits, fees, statements) ---------- */

  function configNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // Unpaid amounts for a card across every stored month. Billed = has a due date, unbilled = no due date yet.
  function balanceFor(id) {
    let billed = 0;
    let unbilled = 0;
    let billedMonths = 0;
    let nextDue = null;
    for (const month of Object.keys(state.months)) {
      const e = entry(month, id);
      const a = amountOf(e);
      if (e.paid || a <= 0) continue;
      const due = parseDate(e.dueDate);
      if (due) {
        billed += a;
        billedMonths++;
        if (!nextDue || due < nextDue.date) nextDue = { date: due, amount: a, status: statusOf(e) };
      } else {
        unbilled += a;
      }
    }
    return { billed, unbilled, total: billed + unbilled, billedMonths, nextDue };
  }

  function limitOf(card) {
    return configNumber(card.limit);
  }

  function feeOf(card) {
    const base = configNumber(card.annualFee);
    if (base === null) return null;
    const tax = configNumber(card.feeTax) || 0;
    return { base, tax, total: Math.round(base * (1 + tax / 100) * 100) / 100, free: base === 0 };
  }

  // Renewal stays in this year's month until that month has passed, then moves to next year.
  function nextRenewal(card) {
    const m = configNumber(card.feeMonth);
    if (!m || m < 1 || m > 12 || !Number.isInteger(m)) return null;
    const t = today();
    const year = t.getFullYear() + (t.getMonth() + 1 > m ? 1 : 0);
    return { date: new Date(year, m - 1, 1), inMonths: (year - t.getFullYear()) * 12 + (m - 1 - t.getMonth()) };
  }

  // Next statement generation date; days past the month's end fall on its last day.
  function nextStatement(card) {
    const d = configNumber(card.statementDay);
    if (!d || d < 1 || d > 31) return null;
    const t = today();
    const on = (y, m) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
    let date = on(t.getFullYear(), t.getMonth());
    if (date < t) date = on(t.getFullYear(), t.getMonth() + 1);
    return date;
  }

  function inDays(n) {
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    if (n < 0) return plural(-n, "day") + " ago";
    return "In " + plural(n, "day");
  }

  function pctText(p) {
    return (p > 0 && p < 1 ? "<1" : Math.round(p)) + "%";
  }

  function usageTone(p) {
    return p >= 90 ? "overdue" : p >= 70 ? "soon" : "ok";
  }

  function setMeter(meter, pct) {
    meter.dataset.tone = usageTone(pct);
    meter.firstElementChild.style.width = Math.min(100, Math.max(0, pct)) + "%";
  }

  /* ---------- Shared UI ---------- */

  let currentMonth = monthKeyOf(today());
  let viewMonth = currentMonth;
  let view = "home";
  let selectedId = cards.length ? cards[0].id : null;

  const $ = (id) => document.getElementById(id);
  const grid = $("grid");
  const tileTemplate = $("tile-template");

  if (window.Icons) {
    Icons.hydrate(document);
    for (const tpl of document.querySelectorAll("template")) Icons.hydrate(tpl.content);
  }

  const tiles = new Map();

  function applyHolder(holder, card) {
    holder.removeAttribute("style");
    holder.hidden = !(card.holder && window.CARD_HOLDER);
    if (holder.hidden) return;
    holder.textContent = window.CARD_HOLDER;
    if (card.holder.right) holder.style.right = card.holder.right;
    else holder.style.left = card.holder.x || "8%";
    holder.style.top = card.holder.y || "78%";
    if (card.holder.color) holder.style.color = card.holder.color;
  }

  /* ---------- Monthly view (five-card tiles) ---------- */

  function setEditing(card, on) {
    const t = tiles.get(card.id);
    t.editing = on;
    t.el.classList.toggle("is-editing", on);
    t.amount.disabled = !on;
    t.due.disabled = !on;
    if (on) {
      const e = entry(viewMonth, card.id);
      t.amount.value = e.amount;
      t.due.value = e.dueDate;
      t.amount.focus();
    }
  }

  function commit(card) {
    const t = tiles.get(card.id);
    update(viewMonth, card.id, { amount: normaliseAmount(t.amount.value), dueDate: t.due.value });
    setEditing(card, false);
    refresh();
    t.editBtn.focus();
  }

  function cancel(card) {
    const t = tiles.get(card.id);
    setEditing(card, false);
    t.editBtn.focus();
  }

  function renderTile(card) {
    const el = tileTemplate.content.firstElementChild.cloneNode(true);
    const img = el.querySelector(".card-img");

    el.style.setProperty("--accent", card.accent || "#888");
    img.src = card.image;
    img.alt = card.bank + " " + card.name + " credit card";
    img.addEventListener("load", () => {
      el.classList.toggle("is-portrait", img.naturalHeight > img.naturalWidth);
    });
    el.querySelector(".bank").textContent = card.bank;
    el.querySelector(".name").textContent = card.name;
    applyHolder(el.querySelector(".holder"), card);

    const t = {
      el,
      editing: false,
      amount: el.querySelector(".amount"),
      due: el.querySelector(".due"),
      amountValue: el.querySelector(".amount-value"),
      dueValue: el.querySelector(".due-value"),
      toggle: el.querySelector(".paid-toggle"),
      editBtn: el.querySelector(".edit-btn"),
    };
    tiles.set(card.id, t);

    t.editBtn.addEventListener("click", () => setEditing(card, true));
    el.querySelector(".save-btn").addEventListener("click", () => commit(card));
    el.querySelector(".cancel-btn").addEventListener("click", () => cancel(card));
    for (const input of [t.amount, t.due]) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commit(card);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          cancel(card);
        }
      });
    }
    t.toggle.addEventListener("click", () => {
      update(viewMonth, card.id, { paid: !entry(viewMonth, card.id).paid });
      refresh();
    });

    setEditing(card, false);
    return el;
  }

  function renderMonthly() {
    for (const card of cards) {
      const t = tiles.get(card.id);
      const e = entry(viewMonth, card.id);
      const s = statusOf(e);
      const due = parseDate(e.dueDate);

      t.el.dataset.tone = s.tone;
      t.el.classList.toggle("is-paid", e.paid);
      t.el.querySelector(".pill").textContent = s.label;
      t.toggle.setAttribute("aria-checked", String(e.paid));
      t.toggle.querySelector(".paid-text").textContent = e.paid ? "Paid" : "Mark as paid";

      t.amountValue.textContent = e.amount ? money(amountOf(e)) : "—";
      t.amountValue.classList.toggle("is-empty", !e.amount);
      t.dueValue.textContent = due ? fullDate.format(due) : "—";
      t.dueValue.classList.toggle("is-empty", !due);
    }
    $("month-label").textContent = monthName.format(monthFromKey(viewMonth));
    $("this-month").hidden = viewMonth === currentMonth;
  }

  function showMonth(key) {
    viewMonth = key;
    for (const card of cards) setEditing(card, false);
    renderMonthly();
  }

  $("prev-month").addEventListener("click", () => showMonth(shiftMonth(viewMonth, -1)));
  $("next-month").addEventListener("click", () => showMonth(shiftMonth(viewMonth, 1)));
  $("this-month").addEventListener("click", () => showMonth(currentMonth));

  /* ---------- Home view ---------- */

  const rowTemplate = $("row-template");
  const rows = new Map();

  for (const card of cards) {
    const li = rowTemplate.content.firstElementChild.cloneNode(true);
    const btn = li.querySelector(".row");
    btn.style.setProperty("--accent", card.accent || "#888");
    btn.querySelector(".row-thumb img").src = card.image;
    btn.querySelector(".row-title").textContent = card.name;
    btn.querySelector(".row-bank").textContent = card.bank;
    btn.setAttribute("aria-label", card.bank + " " + card.name + " — open card details");
    btn.addEventListener("click", () => {
      selectedId = card.id;
      renderDetail();
      goTo("cards");
    });
    $("h-rows").appendChild(li);
    rows.set(card.id, btn);
  }

  // Totals (outstanding = billed + unbilled across all months) and one row per card, sorted by outstanding:
  // outstanding, utilisation of its limit, annual fee and next renewal.
  function renderHome() {
    let billed = 0;
    let unbilled = 0;
    const order = [];

    for (const card of cards) {
      const bal = balanceFor(card.id);
      order.push([card.id, bal.total]);
      const limit = limitOf(card);
      const fee = feeOf(card);
      const renewal = nextRenewal(card);
      billed += bal.billed;
      unbilled += bal.unbilled;

      const row = rows.get(card.id);
      const pct = limit ? (bal.total / limit) * 100 : 0;
      row.querySelector(".row-out").textContent = money(bal.total);
      row.querySelector(".row-pct").textContent = limit ? pctText(pct) : "—";
      setMeter(row.querySelector(".meter"), pct);

      const feeEl = row.querySelector(".row-fee");
      feeEl.textContent = !fee ? "—" : fee.free ? "Free" : money(fee.total);
      feeEl.classList.toggle("is-free", !!fee && fee.free);
      feeEl.title = fee && !fee.free && fee.tax ? money(fee.base) + " + " + fee.tax + "% GST" : "";

      const renewEl = row.querySelector(".row-renew");
      renewEl.textContent = fee && !fee.free && renewal ? shortMonth.format(renewal.date) : "—";
      renewEl.classList.toggle("is-soon", !!renewal && !(fee && fee.free) && renewal.inMonths <= 1);
    }

    $("h-outstanding").textContent = money(billed + unbilled);
    $("h-billed").textContent = money(billed);
    $("h-unbilled").textContent = money(unbilled);

    // Highest outstanding first; ties keep the cards.js order.
    order.sort((a, b) => b[1] - a[1]);
    const list = $("h-rows");
    order.forEach(([id], i) => {
      const li = rows.get(id).parentElement;
      if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
    });
  }

  /* ---------- Cards view: one card at a time ---------- */

  const detailEl = $("detail");
  const detailImg = $("detail-img");
  const picker = $("picker");
  const chips = new Map();

  function renderDetail() {
    const card = cards.find((c) => c.id === selectedId) || cards[0];
    if (!card) return;
    selectedId = card.id;

    for (const [id, chip] of chips) chip.setAttribute("aria-checked", String(id === card.id));

    detailEl.style.setProperty("--accent", card.accent || "#888");
    if (detailImg.getAttribute("src") !== card.image) {
      detailEl.classList.remove("is-portrait");
      detailImg.src = card.image;
    }
    detailImg.alt = card.bank + " " + card.name + " credit card";
    applyHolder($("detail-holder"), card);
    $("detail-title").textContent = card.bank + " " + card.name;

    const limit = limitOf(card);
    const bal = balanceFor(card.id);

    $("d-limit").textContent = limit === null ? "—" : money(limit);
    $("d-outstanding").textContent = money(bal.total);
    $("d-billed").textContent = money(bal.billed);
    $("d-billed-sub").textContent = bal.nextDue
      ? "Next due " + shortDate.format(bal.nextDue.date) + " · " + bal.nextDue.status.label.toLowerCase()
      : "No pending dues";
    $("d-unbilled").textContent = money(bal.unbilled);

    const available = $("d-available");
    const meter = $("d-meter");
    if (limit === null) {
      available.textContent = "—";
      available.classList.remove("is-negative");
      meter.hidden = true;
      $("d-meter-text").textContent = "";
    } else {
      const left = limit - bal.total;
      const pct = limit > 0 ? (bal.total / limit) * 100 : 0;
      available.textContent = (left < 0 ? "−" : "") + money(Math.abs(left));
      available.classList.toggle("is-negative", left < 0);
      meter.hidden = limit <= 0;
      setMeter(meter, pct);
      $("d-meter-text").textContent = pctText(pct) + " used · " + money(bal.total) + " of " + money(limit);
    }

    const st = nextStatement(card);
    $("d-statement").textContent = st ? shortDate.format(st) : "—";
    $("d-statement-sub").textContent = st ? ordinal(configNumber(card.statementDay)) + " monthly · " + inDays(daysUntil(st)).toLowerCase() : "";

    const fee = feeOf(card);
    const rn = nextRenewal(card);
    if (!fee) {
      $("d-fee").textContent = "—";
      $("d-fee-sub").textContent = "";
    } else if (fee.free) {
      $("d-fee").textContent = "Lifetime free";
      $("d-fee-sub").textContent = "No renewal fee";
    } else {
      $("d-fee").textContent = money(fee.total);
      const parts = [money(fee.base) + (fee.tax ? " + " + fee.tax + "% GST" : "")];
      if (rn) parts.push("renews " + (rn.inMonths === 0 ? "this month" : shortMonth.format(rn.date)));
      $("d-fee-sub").textContent = parts.join(" · ");
    }
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  detailImg.addEventListener("load", () => {
    detailEl.classList.toggle("is-portrait", detailImg.naturalHeight > detailImg.naturalWidth);
  });

  function selectCard(id) {
    selectedId = id;
    renderDetail();
    writeHash();
  }

  function stepCard(delta) {
    if (!cards.length) return;
    const i = Math.max(0, cards.findIndex((c) => c.id === selectedId));
    selectCard(cards[(i + delta + cards.length) % cards.length].id);
  }

  for (const card of cards) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.setAttribute("role", "radio");
    chip.title = card.bank + " " + card.name;
    const img = document.createElement("img");
    img.src = card.image;
    img.alt = "";
    const label = document.createElement("span");
    label.textContent = card.name;
    chip.append(img, label);
    chip.addEventListener("click", () => selectCard(card.id));
    picker.appendChild(chip);
    chips.set(card.id, chip);
  }

  $("detail-prev").addEventListener("click", () => stepCard(-1));
  $("detail-next").addEventListener("click", () => stepCard(1));
  document.addEventListener("keydown", (ev) => {
    if (view !== "cards" || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (ev.key === "ArrowLeft") stepCard(-1);
    else if (ev.key === "ArrowRight") stepCard(1);
  });

  /*
   * Sections (portfolio-style): Home, Monthly and Cards are stacked full-screen pages. Scrolling snaps from
   * one to the next and the nav icons scroll to a page. The visible page is kept in the URL hash
   * (#monthly, #cards/<card-id>; Home has none).
   */

  const VIEWS = ["home", "monthly", "cards"];
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function writeHash() {
    const hash = view === "cards" ? "#cards/" + selectedId : view === "monthly" ? "#monthly" : "";
    if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname + location.search);
  }

  function readHash() {
    const m = /^#(monthly|cards)(?:\/(.+))?$/.exec(location.hash);
    if (!m) return "home";
    if (m[1] === "cards" && m[2] && cards.some((c) => c.id === decodeURIComponent(m[2]))) {
      selectedId = decodeURIComponent(m[2]);
    }
    return m[1];
  }

  function setActive(next) {
    if (next === view) return;
    view = next;
    document.body.dataset.view = view;
    for (const tab of document.querySelectorAll(".tab")) {
      if (tab.dataset.view === view) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    if (view !== "monthly") for (const card of cards) setEditing(card, false);
    writeHash();
  }

  function goTo(next, instant) {
    const target = VIEWS.includes(next) ? next : "home";
    $("view-" + target).scrollIntoView({ behavior: instant || REDUCED_MOTION ? "instant" : "smooth", block: "start" });
    setActive(target);
  }

  function refresh() {
    renderMonthly();
    renderHome();
    renderDetail();
  }

  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => goTo(tab.dataset.view));
  }
  window.addEventListener("hashchange", () => goTo(readHash()));

  // Whichever page fills most of the screen is the active one.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id.replace("view-", ""));
    },
    { threshold: 0.55 },
  );
  for (const v of VIEWS) observer.observe($("view-" + v));

  view = null;

  // One row on desktop for up to 6 cards; beyond that, split into two rows.
  grid.style.setProperty("--cols", String(cards.length <= 6 ? Math.max(cards.length, 1) : Math.ceil(cards.length / 2)));
  for (const card of cards) grid.appendChild(renderTile(card));
  const initial = readHash();
  refresh();
  goTo(initial, true);

  window.addEventListener("storage", (ev) => {
    if (ev.key !== STORAGE_KEY) return;
    state = load();
    refresh();
  });

  // Keep statuses accurate and roll over to the new month if the page stays open.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const nowMonth = monthKeyOf(today());
    if (nowMonth !== currentMonth) {
      const wasOnCurrent = viewMonth === currentMonth;
      currentMonth = nowMonth;
      if (wasOnCurrent) viewMonth = currentMonth;
    }
    refresh();
  });

  /* ---------- Google Drive sync (optional, see config.js) ---------- */

  const syncWrap = $("sync");
  const syncBtn = $("sync-chip");
  const syncPop = $("sync-pop");
  const syncText = $("sync-text");
  const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
  let syncState = "off";

  const SYNC_LABELS = {
    disconnected: "Connect Google Drive",
    expired: "Reconnect Google Drive",
    syncing: "Syncing…",
    offline: "Offline · saved locally",
    error: "Sync failed",
  };

  function onSyncStatus(next, detail) {
    syncState = next;
    syncWrap.hidden = next === "off";
    syncWrap.dataset.state = next;
    syncText.textContent = next === "synced" ? "Synced " + timeFmt.format(detail || new Date()) : SYNC_LABELS[next] || "";
    syncBtn.title = syncText.textContent;
    syncBtn.setAttribute("aria-label", "Google Drive: " + syncText.textContent);
    $("sync-now").disabled = next === "syncing";
    if (next === "disconnected" || next === "off") togglePop(false);
  }

  function togglePop(open) {
    syncPop.hidden = !open;
    syncBtn.setAttribute("aria-expanded", String(open));
  }

  // Not connected: the cloud signs in directly (keeps the popup inside the click). Connected: show status menu.
  syncBtn.addEventListener("click", () => {
    if (syncState === "disconnected" || syncState === "expired") DriveSync.connect();
    else togglePop(syncPop.hidden);
  });
  $("sync-now").addEventListener("click", () => {
    if (syncState === "expired") DriveSync.connect();
    else DriveSync.syncNow();
  });
  $("sync-disconnect").addEventListener("click", () => {
    if (confirm("Disconnect Google Drive? Your data stays in this browser and in Drive.")) DriveSync.disconnect();
    togglePop(false);
  });
  document.addEventListener("click", (ev) => {
    if (!syncPop.hidden && !syncWrap.contains(ev.target)) togglePop(false);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !syncPop.hidden) {
      togglePop(false);
      syncBtn.focus();
    }
  });

  if (window.DriveSync) {
    DriveSync.init({
      getState: () => state,
      setState: (next) => {
        state = next;
        save();
        refresh();
      },
      merge: mergeStates,
      onStatus: onSyncStatus,
    });
  }
})();
