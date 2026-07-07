#!/usr/bin/env python3
"""
Thin fetch-only CLI for the Tier 1 crawler (PRD §5.2). Does ONE job: retrieve
raw HTML/JSON from a URL and print it as JSON to stdout. All parsing and
persistence stay in TypeScript (src/lib/*) — this script never interprets the
content it fetches.

Usage:
    python3 fetch.py <url> [--render] [--referer <url>] [--timeout <seconds>]

Output (stdout, single line of JSON):
    {"ok": true, "status": 200, "html": "..."}
    {"ok": false, "status": null, "error": "..."}

Modes:
    plain (default) — curl_cffi with browser TLS-fingerprint impersonation.
                       Fast, cheap, good for restaurant websites and
                       lightly-protected ordering platforms.
    --render         — Scrapling + Camoufox (hardened anti-fingerprint
                        Firefox). Slower, handles JS-rendered content and
                        Cloudflare-style challenges. Use for DoorDash,
                        Grubhub when direct fails, and Menufy JS rendering.

Run from the founder's Mac on a residential IP — that's the whole point
(datacenter IPs get blocked regardless of stealth tooling).
"""
import argparse
import json
import sys


def fetch_plain(url: str, referer: str, timeout: int) -> dict:
    from curl_cffi import requests

    headers = {"Referer": referer} if referer else {}
    resp = requests.get(url, headers=headers, impersonate="chrome124", timeout=timeout)
    return {"ok": resp.status_code < 400, "status": resp.status_code, "html": resp.text}


def fetch_rendered(url: str, timeout: int) -> dict:
    # Scrapling's StealthyFetcher drives Camoufox (hardened anti-fingerprint
    # Firefox) to load the page like a real browser, solving basic anti-bot
    # challenges along the way.
    from scrapling.fetchers import StealthyFetcher

    page = StealthyFetcher.fetch(url, timeout=timeout * 1000, headless=True)
    return {"ok": page.status < 400, "status": page.status, "html": page.html_content}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--referer", default="")
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()

    try:
        if args.render:
            result = fetch_rendered(args.url, args.timeout)
        else:
            result = fetch_plain(args.url, args.referer, args.timeout)
    except Exception as e:  # fail-open — the Node side treats this as a miss, not a crash
        result = {"ok": False, "status": None, "error": f"{type(e).__name__}: {e}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
