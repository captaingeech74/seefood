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
import { existsSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const CRAWLER_DIR = join(__dirname, "..", "..", "crawler");
const VENV_DIR = join(CRAWLER_DIR, ".venv");
const VENV_PYTHON = process.platform === "win32"
  ? join(VENV_DIR, "Scripts", "python.exe")
  : join(VENV_DIR, "bin", "python3");
// Written only after a fully successful `pip install`. A failed install still
// leaves a venv directory behind (venv creation succeeds, pip fails) — without
// this marker, ensurePythonEnv would wrongly treat that half-built venv as done.
const INSTALL_MARKER = join(VENV_DIR, ".install_complete");

export interface PythonFetchResult {
  ok: boolean;
  status: number | null;
  html?: string;
  error?: string;
}

function getPythonVersion(exe: string): [number, number] | null {
  const res = spawnSync(exe, ["--version"], { encoding: "utf-8" });
  if (res.status !== 0) return null;
  const m = (res.stdout + res.stderr).match(/Python (\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/**
 * macOS ships an old Python (3.9, from Xcode Command Line Tools) that lacks
 * prebuilt wheels for some of Camoufox's dependencies on newer macOS/Xcode —
 * pyobjc-core fails to build from source with modern Clang (confirmed live,
 * "-Werror,-Wdefault-const-init-var-unsafe"). Prefer any newer Homebrew
 * Python if one is installed; fall back to system python3 otherwise.
 */
function findBestPython(): { exe: string; version: [number, number] } | null {
  const candidates = [
    "python3.13", "python3.12", "python3.11", "python3.10",
    "/opt/homebrew/bin/python3.13", "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.11", "/opt/homebrew/bin/python3.10",
    "/usr/local/bin/python3.13", "/usr/local/bin/python3.12",
    "/usr/local/bin/python3.11", "/usr/local/bin/python3.10",
    "python3",
  ];
  let best: { exe: string; version: [number, number] } | null = null;
  for (const exe of candidates) {
    const version = getPythonVersion(exe);
    if (!version) continue;
    if (!best || version[0] > best.version[0] || (version[0] === best.version[0] && version[1] > best.version[1])) {
      best = { exe, version };
    }
  }
  return best;
}

/** Idempotent — safe to call on every crawler run. Only does real work once. */
export function ensurePythonEnv(): { ready: boolean; reason?: string } {
  const python = findBestPython();
  if (!python) {
    return {
      ready: false,
      reason:
        "python3 not found. Install it from https://www.python.org/downloads/ " +
        "(or `brew install python3`), then re-run `npm run crawl`.",
    };
  }

  if (existsSync(INSTALL_MARKER)) {
    return { ready: true };
  }

  // A venv dir may exist from a previous failed attempt (pip install can fail
  // after venv creation succeeds) — wipe it and start clean rather than build
  // on a half-installed environment.
  if (existsSync(VENV_DIR)) {
    rmSync(VENV_DIR, { recursive: true, force: true });
  }

  console.log(`[crawler] First run — setting up the Python environment with ${python.exe} (Python ${python.version.join(".")}, ~1-2 min)...`);
  if (python.version[0] === 3 && python.version[1] < 10) {
    console.log(
      "[crawler] ⚠ Only Python " + python.version.join(".") + " was found. Camoufox's dependencies " +
      "often lack prebuilt wheels for it on macOS. If setup fails below, install a newer Python " +
      "(`brew install python@3.12`) and re-run `npm run crawl`."
    );
  }

  const venvResult = spawnSync(python.exe, ["-m", "venv", VENV_DIR], { stdio: "inherit" });
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
    return {
      ready: false,
      reason:
        "Failed to install Python dependencies (pip install) — see the log above for the real error. " +
        "Common fix: `brew install python@3.12` for a newer Python, then re-run `npm run crawl`.",
    };
  }

  writeFileSync(INSTALL_MARKER, new Date().toISOString());
  console.log("[crawler] Python environment ready.\n");
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
