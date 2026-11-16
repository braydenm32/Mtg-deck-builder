# Price alerts and notifications

## Price alerts

Collection › Price alerts (`/collection/alerts`), or "Set a price alert" in a card's Prices. An alert
watches one printing in one finish: the printing you own, or else the cheapest regular English
printing. It goes off once, when the price reaches your line, and shows on Today under Needs you
until you clear it.

Prices are checked by the daily price check (`src/lib/prices/daily.ts`), which now also looks at the
printings a waiting alert watches, and after each weekly card download. Code: `src/lib/prices/alerts.ts`.

## When the check runs

- When you open Today and the last check is more than 20 hours old (as before).
- Once a day from Vercel's scheduler (`vercel.json` › `crons`, 21:00 UTC, about 7–8am in eastern
  Australia), so alerts go off on days you don't open the app. The call goes to `/api/cron/prices`,
  which the password lock lets through. It can only start a price check (at most once a day) and
  shows no data. To lock it to Vercel's scheduler only, add a `CRON_SECRET` environment variable
  (any long random text) in Vercel; Vercel then sends it with each call.

## Phone notifications (optional)

On the Price alerts page, "Turn on for this phone". The app makes its own key pair the first time
(kept in the database), so there's nothing to set up. On an iPhone, notifications only work in the
app added to the Home Screen (iOS 16.4 or later).

A notification carries no message. It only wakes the app on the phone, which asks the app what
happened (`/api/push/notice`) and shows that, so nothing about your cards passes through Apple's or
Google's push service. Code: `src/lib/push.ts`, and the `push` handler in `public/sw.js`.

To use your own keys instead, run `npm run vapid-keys` and add `VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`, a `mailto:` address) to the environment. Phones
then need to turn notifications on again.
