#!/usr/bin/env node
/**
 * Try the dashboard on a real phone: booking alerts and the installed app need HTTPS, so this starts the dev server
 * and a temporary HTTPS tunnel (Cloudflare's free "quick tunnel", downloaded by npx on first use) and prints the
 * address to open on the phone. Stop with Ctrl+C; the address stops working.
 *
 *   npm run dev:phone
 *
 * Local Supabase must be reachable from the phone too for sign-in: this works when the phone uses the tunnel only
 * for the app and the app talks to Supabase from this computer (server side), which is how the dashboard works.
 */
import { spawn } from "node:child_process";

const PORT = 3417;
const shell = process.platform === "win32";
const dev = spawn("npx", ["next", "dev", "--port", String(PORT)], { stdio: "inherit", shell });
const tunnel = spawn("npx", ["--yes", "cloudflared", "tunnel", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"], shell });

const found = (chunk) => {
  const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk))?.[0];
  if (url) console.log(`\n  Open on your phone: ${url}/dashboard\n  (Add it to the Home Screen to try the installed app and alerts.)\n`);
};
tunnel.stdout.on("data", found);
tunnel.stderr.on("data", found);

const stop = () => {
  dev.kill();
  tunnel.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
dev.on("exit", stop);
