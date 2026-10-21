# SeeFood certificate-verification repair — 21 October 2026

Scope: the current SeeFood repository and its Mac nightly crawler only. No DataLab worktree, other project, production data, or Cloudflare configuration was changed.

## What changed

- All 43 `rejectUnauthorized: false` database settings in 42 current SeeFood scripts now use one verified Supabase TLS policy. It trusts only the public Supabase Root 2021 CA, checks the server hostname, rejects non-Supabase database hosts, and rejects URL SSL options that would override `pg`'s TLS settings. The CA was retrieved from Supabase's published certificate endpoint; its SHA-256 fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. If Supabase rotates this root, review the new certificate before updating it here.
- The plain Python website fetch explicitly uses `certifi` 2026.10.19 or later. This avoids `curl_cffi` silently selecting the older Homebrew CA bundle.
- Headless browser fetches now precheck HTTPS destinations against the maintained CA bundle. Patchright checks each requested host before letting the browser fetch it; the optional Scrapling and Crawl4AI engines precheck their top-level URL. This matters because the installed headless Chromium/Scrapling/Crawl4AI browsers accepted the public compromised-certificate fixture before the guard.
- The nightly Mac job now uses an isolated SeeFood Node 22.23.4 binary and stops if it is missing. The binary was copied from the audit's official, checksum-verified Node archive into `~/.local/share/seefood/node-v22.23.4/bin`. `.node-version` records the version for other local execution.

## Verification

- A read-only `select 1` over the actual Supabase pooler succeeded with CA and hostname verification on.
- The patched Node default fetch, plain Python fetch, and browser host gate rejected all 12 public eMudhra TLS fixtures. Valid `example.com` worked; expired and wrong-host certificates were rejected. The actual Patchright rendered fetch rejected a compromised fixture and successfully rendered the Wooden City gallery.
- `npm test`: 199 passed. `npx tsc --noEmit`: passed. `npm run build`: passed. The 42 edited scripts contain no remaining certificate-check bypasses, and edited `.mjs` files pass syntax checking.

## Limits

The host precheck is a mitigation, not a replacement for a browser whose own verifier rejects the compromised chain. A targeted attacker who presents different certificates to the precheck and browser could bypass it; optional Scrapling/Crawl4AI subresources are not individually checked. Keep those browser runtimes updated and retest them when patched builds are available. Production Vercel is configured for Node 24.x and manages patch updates itself; its exact executing patch and outbound verifier were not proved by this local repair. The separate legacy DataLab checkout is unchanged.
