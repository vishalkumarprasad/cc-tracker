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

  /* ---------- UI ---------- */

  let currentMonth = monthKeyOf(today());
  let viewMonth = currentMonth;

  const grid = document.getElementById("grid");
  const template = document.getElementById("tile-template");
  const tiles = new Map();

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
    const el = template.content.firstElementChild.cloneNode(true);
    const img = el.querySelector(".card-img");

    el.style.setProperty("--accent", card.accent || "#888");
    img.src = card.image;
    img.alt = card.bank + " " + card.name + " credit card";
    img.addEventListener("load", () => {
      el.classList.toggle("is-portrait", img.naturalHeight > img.naturalWidth);
    });
    el.querySelector(".bank").textContent = card.bank;
    el.querySelector(".name").textContent = card.name;

    const holder = el.querySelector(".holder");
    if (card.holder && window.CARD_HOLDER) {
      holder.textContent = window.CARD_HOLDER;
      if (card.holder.right) holder.style.right = card.holder.right;
      else holder.style.left = card.holder.x || "8%";
      holder.style.top = card.holder.y || "78%";
      if (card.holder.color) holder.style.color = card.holder.color;
      holder.hidden = false;
    }

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

  function refresh() {
    let outstanding = 0;
    let paidCount = 0;
    let next = null;

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

      if (e.paid) {
        paidCount++;
        continue;
      }
      outstanding += amountOf(e);
      if (due && (!next || due < next.date)) next = { date: due, card, status: s };
    }

    document.getElementById("sum-outstanding").textContent = money(outstanding);
    document.getElementById("sum-paid").textContent = paidCount + " / " + cards.length;

    const nextEl = document.getElementById("sum-next");
    const nextSub = document.getElementById("sum-next-sub");
    if (next) {
      nextEl.textContent = shortDate.format(next.date);
      nextSub.textContent = next.card.bank + " " + next.card.name + " · " + next.status.label.toLowerCase();
      nextEl.parentElement.dataset.tone = next.status.tone;
    } else {
      nextEl.textContent = "—";
      nextSub.textContent = cards.length && paidCount === cards.length ? "All clear" : "";
      delete nextEl.parentElement.dataset.tone;
    }

    document.getElementById("month-label").textContent = monthName.format(monthFromKey(viewMonth));
    document.getElementById("this-month").hidden = viewMonth === currentMonth;
  }

  function showMonth(key) {
    viewMonth = key;
    for (const card of cards) setEditing(card, false);
    refresh();
  }

  document.getElementById("prev-month").addEventListener("click", () => showMonth(shiftMonth(viewMonth, -1)));
  document.getElementById("next-month").addEventListener("click", () => showMonth(shiftMonth(viewMonth, 1)));
  document.getElementById("this-month").addEventListener("click", () => showMonth(currentMonth));

  // One row on desktop for up to 6 cards; beyond that, split into two rows.
  grid.style.setProperty("--cols", String(cards.length <= 6 ? Math.max(cards.length, 1) : Math.ceil(cards.length / 2)));
  for (const card of cards) grid.appendChild(renderTile(card));
  refresh();

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
      if (wasOnCurrent) return showMonth(currentMonth);
    }
    refresh();
  });

  /* ---------- Google Drive sync (optional, see config.js) ---------- */

  const syncWrap = document.getElementById("sync");
  const syncChip = document.getElementById("sync-chip");
  const syncText = document.getElementById("sync-text");
  const syncOff = document.getElementById("sync-disconnect");
  const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
  let syncState = "off";

  const SYNC_LABELS = {
    disconnected: "Connect Google Drive",
    expired: "Reconnect Drive",
    syncing: "Syncing…",
    offline: "Offline · saved locally",
    error: "Sync failed · retry",
  };

  function onSyncStatus(next, detail) {
    syncState = next;
    syncWrap.hidden = next === "off";
    syncWrap.dataset.state = next;
    syncText.textContent = next === "synced" ? "Synced " + timeFmt.format(detail || new Date()) : SYNC_LABELS[next] || "";
    syncChip.title =
      next === "synced" ? "Saved to Google Drive · click to sync now" : next === "syncing" ? "" : syncText.textContent;
    syncOff.hidden = !(next === "synced" || next === "error" || next === "offline");
  }

  syncChip.addEventListener("click", () => {
    if (syncState === "disconnected" || syncState === "expired") DriveSync.connect();
    else if (syncState !== "syncing") DriveSync.syncNow();
  });
  syncOff.addEventListener("click", () => {
    if (confirm("Disconnect Google Drive? Your data stays in this browser and in Drive.")) DriveSync.disconnect();
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
