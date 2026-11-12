#!/usr/bin/env node
/**
 * Runs Vitest from the canonical path of the current directory.
 * On Windows a lowercase drive letter (c:\ vs C:\, e.g. from VS Code terminals) makes Vitest load
 * itself twice and fail with "Vitest failed to find the current suite". Linux/macOS are unaffected.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

const cwd = realpathSync.native(process.cwd());
const bin = path.join(cwd, "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
