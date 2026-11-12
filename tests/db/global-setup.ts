import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

/**
 * Reads the local Supabase URL/keys from `supabase status` and refuses to run against anything
 * that isn't on this machine. DB tests write and delete data: never point them at production.
 */
export default function setup(project: TestProject) {
  let status: string;
  try {
    status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("Local Supabase isn't running. Start it with `npm run db:start`.");
  }
  const get = (key: string) => status.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"))?.[1] ?? "";
  const env = {
    DB_TEST_API_URL: get("API_URL"),
    DB_TEST_DB_URL: get("DB_URL"),
    DB_TEST_PUBLISHABLE_KEY: get("PUBLISHABLE_KEY"),
    DB_TEST_SECRET_KEY: get("SECRET_KEY"),
  };
  for (const url of [env.DB_TEST_API_URL, env.DB_TEST_DB_URL]) {
    const host = new URL(url).hostname;
    if (!["127.0.0.1", "localhost", "::1", "host.docker.internal"].includes(host)) {
      throw new Error(`Refusing to run DB tests against non-local host: ${host}`);
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (!value) throw new Error(`Missing ${key} from supabase status`);
    project.provide(key as keyof typeof env, value);
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    DB_TEST_API_URL: string;
    DB_TEST_DB_URL: string;
    DB_TEST_PUBLISHABLE_KEY: string;
    DB_TEST_SECRET_KEY: string;
  }
}
