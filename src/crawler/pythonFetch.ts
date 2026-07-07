/**
 * Bridge to crawler/fetch.py — the ONLY thing Python does is retrieve raw
 * HTML. All parsing happens back in TypeScript via the exact same parser
 * functions the live serverless path uses (src/lib/google.ts, menuSources.ts).
 *
 * Self-installs on first run: creates crawler/.venv and installs
 * requirements.txt if missing, so `npm run crawl` is the only command Kyle
 * ever has to type — no manual Python setup.
 */
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const CRAWLER_DIR = join(__dirname, "..", "..", "crawler");
const VENV_DIR = join(CRAWLER_DIR, ".venv");
const VENV_PYTHON = process.platform === "win32"
  ? join(VENV_DIR, "Scripts", "python.exe")
  : join(VENV_DIR, "bin", "python3");

export interface PythonFetchResult {
  ok: boolean;
  status: number | null;
  html?: string;
  error?: string;
}

/** Idempotent — safe to call on every crawler run. Only does work once. */
export function ensurePythonEnv(): { ready: boolean; reason?: string } {
  const python3 = spawnSync("python3", ["--version"]);
  if (python3.status !== 0) {
    return {
      ready: false,
      reason:
        "python3 not found. Install it from https://www.python.org/downloads/ " +
        "(or `brew install python3`), then re-run `npm run crawl`.",
    };
  }

  if (!existsSync(VENV_PYTHON)) {
    console.log("[crawler] First run — setting up the Python environment (one-time, ~1-2 min)...");
    const venvResult = spawnSync("python3", ["-m", "venv", VENV_DIR], { stdio: "inherit" });
    if (venvResult.status !== 0) {
      return { ready: false, reason: "Failed to create Python virtual environment." };
    }
    console.log("[crawler] Installing Python dependencies (curl_cffi, scrapling, camoufox)...");
    const pipResult = spawnSync(
      VENV_PYTHON,
      ["-m", "pip", "install", "-q", "-r", join(CRAWLER_DIR, "requirements.txt")],
      { stdio: "inherit" }
    );
    if (pipResult.status !== 0) {
      return { ready: false, reason: "Failed to install Python dependencies (pip install)." };
    }
    console.log("[crawler] Python environment ready.\n");
  }

  return { ready: true };
}

/**
 * Fetch a URL via the Python side. `render: true` uses Scrapling/Camoufox
 * (slow, handles JS + anti-bot challenges) — reserve for hard targets
 * (DoorDash, Grubhub fallback, Menufy JS rendering). Otherwise uses
 * curl_cffi (fast, browser TLS-fingerprint impersonation).
 */
export function pythonFetch(
  url: string,
  opts: { render?: boolean; referer?: string; timeoutSec?: number } = {}
): PythonFetchResult {
  const args = [join(CRAWLER_DIR, "fetch.py"), url];
  if (opts.render) args.push("--render");
  if (opts.referer) args.push("--referer", opts.referer);
  if (opts.timeoutSec) args.push("--timeout", String(opts.timeoutSec));

  const result = spawnSync(VENV_PYTHON, args, {
    encoding: "utf-8",
    timeout: (opts.timeoutSec ?? 20) * 1000 + 15000,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    return { ok: false, status: null, error: result.stderr?.trim() || String(result.error) };
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return { ok: false, status: null, error: "Could not parse fetch.py output" };
  }
}
