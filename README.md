# VKP's CC Tracker

A fully local, offline credit card due tracker. No server, no network, no dependencies.

## Use

Open `index.html` in any browser. For each card you can set the **amount due**, the **due date**, and toggle **paid**.
Tap the pencil to edit amount/date, then ✓ (or Enter) to save — saved values are shown read-only. ✕ (or Esc) cancels.

Data is kept **per month**: each new month starts empty, and the ‹ › arrows let you browse earlier months' records.
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
Click **Connect Google Drive** next to the month. Sign-in tokens last ~1 hour; after that click **Reconnect Drive**
(edits made meanwhile are kept locally and uploaded on reconnect).

On desktop (≥1100×560) everything fits on one screen without scrolling. Font: [Geist](https://github.com/vercel/geist-font), bundled locally in `fonts/` (SIL OFL 1.1).

## Add / remove cards

Cards can only be changed in code:

1. Put the card image in `images/` (PNG with transparent rounded corners looks best).
2. Add or remove an entry in `cards.js`. Keep each `id` unique and stable — it's the key for saved data.
3. Optional `holder: { x | right, y, color }` positions the cardholder text (`CARD_HOLDER`, "V K P") on that card's image.

## Publishing updates

`index.html` loads the CSS/JS with a version tag (`?v=2026.11.26.1`). When you change any of those files, bump the
tag in `index.html` and upload it too, so browsers fetch the new files instead of cached ones.
