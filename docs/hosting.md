# Hosting MTG Deck Tutor on Vercel

This puts the app on a private web address (like `mtg-deck-tutor.vercel.app`) that you open on your phone or computer and install from there. Nothing to install on your computer, and every change merged into `main` goes live by itself.

**What it uses**

- **Vercel** (free Hobby plan): runs the app over HTTPS, which the phone camera scanner needs.
- **Turso** (free plan): a hosted SQLite database for your collection, decks and the card data. Added from inside Vercel.
- **A password** you choose (`APP_PASSWORD`), so only you can open your collection.

Both free plans are enough for one person. Turso's free plan allows 500 million rows read and 10 million rows written a month; the app is built to stay well under that (see [Limits](#limits)).

## Set it up (about 10 minutes)

1. **Import the repository.** Go to [vercel.com/new](https://vercel.com/new) and choose **Continue with GitHub**. Find **mtg-deck-builder** in the list and press **Import**. (If it isn't listed, choose *Adjust GitHub App Permissions* and give Vercel access to that repository.)
2. **Choose your password.** On the next screen, open **Environment Variables**. For *Key* type `APP_PASSWORD`, for *Value* type the password you want, and press **Add**. Then press **Deploy**. When it finishes, opening the site says it needs a database. That's the next step.
3. **Add the database.** In your new Vercel project, open the **Storage** tab and press **Create Database**. Pick **Turso**, accept its terms and the **Free** plan, choose the **Tokyo** region (closest to Australia, and where the app runs), and create it. When Vercel asks which projects to connect it to, keep this project and all environments ticked.
4. **Redeploy** so the app sees the database: open **Deployments**, press **⋯** on the top one, then **Redeploy**.
5. **Open the app.** Press **Visit** (or open the address shown on the project page), enter your password, and the first visit downloads Scryfall's card data by itself (a minute or two). Then import your Mythic Tools CSV as usual.

### Install it

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app** (or *Add to Home screen*).
- **Computer (Chrome or Edge):** the install icon at the right of the address bar.

Each device asks for the password once, then stays unlocked for a year. An app installed on an iPhone home screen keeps its own sign-in, so it asks once more the first time you open it from there. To lock a device again: **Settings › Sign out on this device**.

## Good to know

- **Updates go live by themselves.** Every merge into `main` deploys in a minute or two.
- **Card data refreshes itself.** When it's more than a week old, opening Today refreshes it in the background (new sets, prices). Today also has an *Update card data* button if it's ever more than two weeks old.
- **Changing the password:** Vercel › Settings › Environment Variables › edit `APP_PASSWORD`, then redeploy. Every device has to unlock again with the new one.
- **Without a password or a database** the site stays locked and says which one is missing, rather than showing your collection to anyone.

### If Turso isn't in Vercel's Storage list

Create the database at [turso.tech](https://turso.tech) instead (sign in with GitHub, create a database in **Tokyo**, then create a token for it). In Vercel › Settings › Environment Variables, add `DATABASE_URL` (the `libsql://…` address) and `DATABASE_AUTH_TOKEN` (the token), then redeploy.

## Limits

- **Turso free plan:** if any monthly limit is passed the database is blocked until the month ends (or you upgrade to Developer, US$4.99/month). The app avoids the heavy reads: name search and the scanner keep card names in memory, Today's catalogue counts are stored after each sync, and each weekly card refresh writes about 200,000 rows. A 10,000-card import is about 20,000 writes.
- **Vercel Hobby:** each request can run for up to 5 minutes, which covers a 10,000-row import (about a minute against Turso) and the card download (about a minute or two). Uploads are capped at 4.5 MB, so the scanner shrinks bigger photos before sending them.
- **Speed:** the app runs in Vercel's Tokyo region (`vercel.json`) next to a Tokyo Turso database. If the database is somewhere else every query crosses an ocean, so pages get slow; create it in Tokyo, or change `regions` in `vercel.json` to match where it is.

## Running it yourself instead

Anywhere that runs Node 22 works: `npm ci && npm run build && npm start` with `APP_PASSWORD` set, and `DATABASE_URL` pointing at a file on a persistent disk (`file:/data/mtg.db`) or at Turso. `NEXT_OUTPUT=standalone npm run build` produces a self-contained server in `.next/standalone` for Docker-style hosts.

| Variable | Needed | What it does |
|---|---|---|
| `APP_PASSWORD` | On any hosted copy | The password. Without it the app is unlocked locally and locked shut on Vercel. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | On Vercel | Set by Vercel's Turso integration. |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Optional | Any libSQL database (`libsql://…`) or file (`file:…`); wins over the Turso pair. |
| `AUTH_SECRET` | Optional | Extra secret mixed into the session signature; changing it signs every device out. |

## Two-step sign-in (optional)

Settings › Two-step sign-in makes a key for your authenticator app (iPhone Passwords, Google
Authenticator, 1Password...) and checks a code from it. Then add the key in Vercel as
`TOTP_SECRET` and redeploy: unlocking then asks for the password and a six-digit code, and every
device signs in again once. To turn it off (a lost phone, say), delete `TOTP_SECRET` and redeploy.
Code: `src/lib/totp.ts`, `src/app/unlock/route.ts`.
