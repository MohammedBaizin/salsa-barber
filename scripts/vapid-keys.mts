#!/usr/bin/env node
/**
 * Prints a new key pair for booking alerts (Web Push / VAPID). Put both in the environment (Vercel: Production and
 * Preview; the private key marked Sensitive). Changing the keys later means everyone turns alerts on again.
 *
 *   npm run vapid:keys
 */
import { generateVapidKeys } from "../src/lib/push/web-push.ts";

const keys = generateVapidKeys();
console.log(`\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:you@example.com   # a real contact address or https URL\n`);
