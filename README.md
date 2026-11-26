# VKP's CC Tracker

A fully local, offline credit card due tracker. No server, no network, no dependencies.

## Use

Open `index.html` in any browser. The look follows vishalkumarprasad.com: a slate background, the same blurred
three-icon nav bar (Home · Monthly · Cards), frosted panels that lift on hover, Source Code Pro throughout and Iceland (the portfolio's name font) for the app title.
The three pages are stacked full-screen sections: scrolling or swiping snaps from one to the next, and the nav
icons jump straight to a page. Pages:

- **Home** — total outstanding split into billed and unbilled, then one table (highest outstanding first) with each card's outstanding,
  utilisation of its limit, annual fee (incl. GST) and next renewal month. Tap a row to open that card.
- **Monthly** — the five cards for one month. Tap the pencil to edit amount/due date, then ✓ (or Enter) to save;
  ✕ (or Esc) cancels. Toggle **paid** directly. Each new month starts empty; ‹ › browse earlier months.
- **Cards** — one card at a time: available limit, total limit, outstanding, billed, unbilled, next statement and
  annual fee. ← / → keys switch cards; `#cards/<card-id>` links straight to one. Cards are titled `bank` + `name` from `cards.js` (e.g. "Axis Atlas").

Billed = unpaid amounts that have a due date (any month). Unbilled = unpaid amounts with no due date yet.
Everything is saved in the browser's `localStorage` first, so the app always works offline.

## Google Drive sync (optional)

When enabled, data is also saved to a hidden app-only file in your Google Drive (`appDataFolder`, scope
`drive.appdata` — the app can't see anything else in your Drive). Each card/month merges by "latest edit wins",
so laptop and phone stay in sync. With no client ID configured the app makes no network requests at all.

One-time setup (~10 min):

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. "VKP CC Tracker").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **Google Auth Platform → Get started**: app name, your email, Audience **External**.
   Under **Audience → Test users**, add your Gmail address.
4. **Clients → Create client → Web application**. Under **Authorized JavaScript origins** add where the app is
   served from, e.g. `https://vishalkumarprasad.com` and `http://localhost:8080` (no redirect URIs needed).
5. Paste the Client ID into `config.js` → `googleClientId`.

Sync needs the app to be opened over `http(s)://` (not as a `file://`). To try locally:
`python3 -m http.server 8080` in this folder, then open http://localhost:8080.
Click the floating **cloud button** in the bottom-right corner to sign in; once connected it shows a status dot and a menu with **Sync now** / **Disconnect**. Sign-in tokens last ~1 hour; after that click **Reconnect Drive**
(edits made meanwhile are kept locally and uploaded on reconnect).

On desktop (≥1100×560) each page fits one screen exactly. The fonts (Source Code Pro, Iceland) are bundled in `fonts/` (SIL OFL 1.1); icons are Ant Design outlined (MIT, `ICONS-LICENSE.txt`) in `icons.js`. Nothing is loaded from the internet except Google sign-in when Drive sync is used.

## Add / remove cards

Cards can only be changed in code:

1. Put the card image in `images/` (PNG with transparent rounded corners looks best).
2. Add or remove an entry in `cards.js`. Keep each `id` unique and stable — it's the key for saved data.
3. Optional `holder: { x | right, y, color }` positions the cardholder text (`CARD_HOLDER`, "V K P") on that card's image.
4. Card details: `limit` (₹), `annualFee` (₹ before tax; `0` = lifetime free), `feeTax` (%, e.g. 18 for GST),
   `feeMonth` (renewal month 1–12; rolls to next year once that month has passed) and `statementDay` (1–31).
   Available limit = limit − (billed + unbilled).

## Publishing updates

The site sits behind Cloudflare, which caches CSS/JS for up to 4 hours. So updates show up immediately, add a
Cloudflare Cache Rule for this path: **Caching → Cache Rules → Create rule** — *URI Path starts with* `/cc-tracker/`
→ **Bypass cache**, and **Browser TTL → Respect origin** (GitHub Pages sends 10 minutes). Otherwise use
**Caching → Purge Cache** after uploading, or hard-refresh (Cmd + Shift + R).
