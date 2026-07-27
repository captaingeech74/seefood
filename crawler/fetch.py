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


def fetch_rendered(
    url: str,
    timeout: int,
    wait_selector: str = "",
    wait_ms: int = 0,
    capture_grubhub_menu: bool = False,
    grubhub_search_location: str = "",
) -> dict:
    # Scrapling's StealthyFetcher drives Camoufox (hardened anti-fingerprint
    # Firefox) to load the page like a real browser, solving basic anti-bot
    # challenges along the way.
    from scrapling.fetchers import StealthyFetcher

    payloads = []

    def page_setup(page):
        if not capture_grubhub_menu:
            return

        def capture(response):
            response_url = response.url
            is_feed = "api-gtm.grubhub.com/restaurant_gateway/feed/" in response_url
            is_item_batch = (
                "api-gtm.grubhub.com/restaurants/" in response_url
                and "/menu_items/" in response_url
            )
            if not (is_feed or is_item_batch):
                return
            try:
                payloads.append(response.json())
            except Exception:
                pass

        page.on("response", capture)

    def page_action(page):
        if grubhub_search_location:
            address = page.locator('[data-testid="address-input"]').first
            if address.is_visible():
                address.fill(grubhub_search_location)
                page.wait_for_timeout(1_500)
                address.press("ArrowDown")
                address.press("Enter")
                page.wait_for_timeout(1_500)

        if capture_grubhub_menu:
            page.wait_for_selector('[data-testid="restaurant-menu-item"]', timeout=timeout * 1000)
            # Grubhub fetches one category at a time as the virtualized menu moves.
            # A bounded scroll triggers those first-party JSON responses; the
            # response listener above captures data rather than scraping transient
            # DOM nodes.
            for _ in range(28):
                page.mouse.wheel(0, 1400)
                page.wait_for_timeout(250)

    fetch_options = {
        "timeout": timeout * 1000,
        "headless": True,
        "wait": wait_ms,
    }
    if wait_selector:
        fetch_options["wait_selector"] = wait_selector
    if capture_grubhub_menu:
        fetch_options["page_setup"] = page_setup
    if capture_grubhub_menu or grubhub_search_location:
        fetch_options["page_action"] = page_action

    page = StealthyFetcher.fetch(url, **fetch_options)
    # final_url surfaces client-side redirects (DoorDash's router may bounce a
    # dead search URL somewhere useful) — diagnostic value on a 404/miss.
    final_url = getattr(page, "url", None)
    return {
        "ok": page.status < 400,
        "status": page.status,
        "html": page.html_content,
        "finalUrl": final_url if final_url and final_url != url else None,
        "payloads": payloads,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--referer", default="")
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--wait-selector", default="")
    parser.add_argument("--wait-ms", type=int, default=0)
    parser.add_argument("--capture-grubhub-menu", action="store_true")
    parser.add_argument("--grubhub-search-location", default="")
    args = parser.parse_args()

    try:
        if args.render:
            result = fetch_rendered(
                args.url,
                args.timeout,
                args.wait_selector,
                args.wait_ms,
                args.capture_grubhub_menu,
                args.grubhub_search_location,
            )
        else:
            result = fetch_plain(args.url, args.referer, args.timeout)
    except Exception as e:  # fail-open — the Node side treats this as a miss, not a crash
        result = {"ok": False, "status": None, "error": f"{type(e).__name__}: {e}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
