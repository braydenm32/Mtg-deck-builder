/**
 * Optional: make the key pair phone notifications use yourself, instead of the one the app makes
 * and keeps in its database (src/lib/push.ts, docs/notifications.md). Run `npm run vapid-keys` and
 * add the two lines it prints to the app's environment variables. Keep the private key to yourself.
 * Phones that had notifications on need to turn them on again after the keys change.
 */
import { makeVapidKeys } from "../src/lib/push";

const k = makeVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
