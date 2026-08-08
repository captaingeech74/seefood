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
    plain (default) — curl_cffi HTTP client with modern protocol support.
                       Fast, cheap, good for restaurant websites and
                       lightly-protected ordering platforms.
    --render         — a browser renderer for public JavaScript content.
                        Access blocks and human-verification challenges are
                        reported as blocked; this worker does not solve them.

This worker reports access blocks rather than attempting to solve them.
"""
import argparse
import asyncio
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
    capture_menu_json: bool = False,
    grubhub_search_location: str = "",
    engine: str = "patchright",
) -> dict:
    if engine == "crawl4ai":
        return fetch_crawl4ai(url, timeout)
    if engine == "scrapling":
        return fetch_scrapling(url, timeout)
    # Patchright/Chromium executes public client-side JavaScript. It also lets
    # us capture the restaurant's own JSON responses before the virtualized DOM
    # discards off-screen menu sections.
    from patchright.sync_api import sync_playwright

    payloads = []
    priority_payloads = []

    def page_setup(page):
        if not capture_grubhub_menu and not capture_menu_json:
            return

        def capture(response):
            response_url = response.url
            is_feed = "api-gtm.grubhub.com/restaurant_gateway/feed/" in response_url
            is_item_batch = (
                "api-gtm.grubhub.com/restaurants/" in response_url
                and "/menu_items/" in response_url
            )
            content_type = response.headers.get("content-type", "").lower()
            is_menu_json = capture_menu_json and "json" in content_type and not any(hint in response_url.lower() for hint in (
                "analytics", "account", "customer", "checkout", "payment", "tracking"
            ))
            if not (is_feed or is_item_batch or is_menu_json) or len(payloads) + len(priority_payloads) >= 48:
                return
            try:
                length = int(response.headers.get("content-length") or 0)
                if length <= 5_000_000:
                    payload = response.json()
                    if any(hint in response_url.lower() for hint in ("menu", "catalog", "product", "item", "ordering", "restaurant")):
                        priority_payloads.append(payload)
                    else:
                        payloads.append(payload)
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

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
            viewport={"width": 1440, "height": 1000},
        )
        page = context.new_page()
        page.set_default_timeout(timeout * 1000)
        page_setup(page)
        response = page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
        if wait_ms:
            page.wait_for_timeout(wait_ms)
        if wait_selector:
            try:
                page.wait_for_selector(wait_selector, timeout=timeout * 1000)
            except Exception:
                pass
        if capture_grubhub_menu or grubhub_search_location:
            page_action(page)
        elif capture_menu_json:
            # Virtualized first-party menus often fetch categories only as the
            # diner scrolls. Keep this bounded and retain JSON, not screenshots.
            for _ in range(8):
                page.mouse.wheel(0, 1200)
                page.wait_for_timeout(180)
        final_url = page.url
        html = page.content()
        try:
            visible_text = page.locator("body").inner_text(timeout=2_000)[:20_000]
        except Exception:
            visible_text = ""
        status = response.status if response else 200
        context.close()
        browser.close()
    blocked_markers = ("verify you are human", "access denied", "complete the security check", "cloudflare ray id")
    blocked = status in (401, 403, 429) or any(marker in visible_text.lower() for marker in blocked_markers)
    return {
        "ok": status < 400 and not blocked,
        "status": status,
        "html": html,
        "error": "access_blocked" if blocked else None,
        "finalUrl": final_url if final_url and final_url != url else None,
        "payloads": (priority_payloads + payloads)[:32],
    }


def fetch_scrapling(url: str, timeout: int) -> dict:
    # Scrapling 0.4.12 currently asks BrowserForge for a Chrome 149 profile,
    # while BrowserForge 1.2.4's bundled dataset tops out at Chrome 140. Use
    # the newest fingerprint actually present instead of failing during import.
    import scrapling.engines.toolbelt.fingerprints as fingerprints
    fingerprints.chromium_version = 140
    fingerprints.chrome_version = 140
    from scrapling.fetchers import StealthyFetcher
    page = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        timeout=timeout * 1000,
        block_ads=True,
    )
    html = str(page.html_content)
    status = int(getattr(page, "status", 200) or 200)
    final_url = str(getattr(page, "url", url) or url)
    return {"ok": status < 400, "status": status, "html": html, "finalUrl": final_url if final_url != url else None, "payloads": []}


def fetch_crawl4ai(url: str, timeout: int) -> dict:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    async def run():
        browser = BrowserConfig(headless=True, verbose=False)
        config = CrawlerRunConfig(page_timeout=timeout * 1000, wait_until="domcontentloaded")
        async with AsyncWebCrawler(config=browser) as crawler:
            return await crawler.arun(url=url, config=config)

    result = asyncio.run(run())
    html = getattr(result, "html", None) or getattr(result, "cleaned_html", None) or ""
    status = int(getattr(result, "status_code", 200) or 200)
    final_url = str(getattr(result, "url", url) or url)
    success = bool(getattr(result, "success", False)) and bool(html)
    markdown_value = getattr(result, "markdown", "") or ""
    if not isinstance(markdown_value, str):
        markdown_value = str(getattr(markdown_value, "raw_markdown", "") or "")
    discovered_links = []
    links = getattr(result, "links", {}) or {}
    for group in ("internal", "external"):
        for link in links.get(group, []) if isinstance(links, dict) else []:
            href = link.get("href") if isinstance(link, dict) else None
            if href and href not in discovered_links:
                discovered_links.append(href)
    return {
        "ok": success and status < 400,
        "status": status,
        "html": html,
        "error": None if success else str(getattr(result, "error_message", "crawl4ai_failed")),
        "finalUrl": final_url if final_url != url else None,
        "payloads": [],
        "markdown": markdown_value[:2_000_000],
        "links": discovered_links[:100],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--engine", choices=("patchright", "scrapling", "crawl4ai"), default="patchright")
    parser.add_argument("--referer", default="")
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--wait-selector", default="")
    parser.add_argument("--wait-ms", type=int, default=0)
    parser.add_argument("--capture-grubhub-menu", action="store_true")
    parser.add_argument("--capture-menu-json", action="store_true")
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
                args.capture_menu_json,
                args.grubhub_search_location,
                args.engine,
            )
        else:
            result = fetch_plain(args.url, args.referer, args.timeout)
    except Exception as e:  # fail-open — the Node side treats this as a miss, not a crash
        result = {"ok": False, "status": None, "error": f"{type(e).__name__}: {e}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
