import { createHash } from "node:crypto";
import {
  detectOrderingPlatforms,
  extractEmbeddedJsonMenuItems,
  extractPageAssets,
  parseCapturedMenuPayloads,
  parseSchemaOrgMenuItems,
  parseVisibleMenuItems,
  type OrderingPlatform,
} from "../lib/menuSources";
import type { MenuItemData } from "../lib/types";
import { parseMenuText } from "./pdfMenu";
import { pythonFetchAsync, type PythonFetchResult } from "./pythonFetch";

export type WebsiteV3Target = {
  websiteId: string;
  entityId: string;
  jobId: string;
  leaseToken: string;
  url: string;
  domain: string;
  restaurantName: string;
  attempts: number;
};

export type WebsiteItemEvidence = {
  item: MenuItemData;
  method: string;
  evidenceUrl: string;
  confidence: number;
  sourceKey: string;
  fingerprint: string;
};

export type PageEvidence = {
  requestedUrl: string;
  finalUrl: string;
  method: string;
  status: number | null;
  sha256?: string;
  itemCount: number;
  platformCount: number;
};

export type WebsiteV3Result = {
  status: "completed" | "empty" | "blocked" | "failed";
  items: WebsiteItemEvidence[];
  genericPhotos: string[];
  linkedPhotos: string[];
  pdfUrls: string[];
  pages: PageEvidence[];
  platforms: OrderingPlatform[];
  methods: string[];
  routeDecisions: string[];
  elapsedMs: number;
  error?: string;
};

const BLOCKED = /access denied|verify you are human|complete the security check|cloudflare ray id/i;
const JS_SHELL = /<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>|enable javascript/i;

export function normalizeMenuItemName(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function safePublicUrl(value: string | undefined, base?: string): string | undefined {
  if (!value || value.length > 2_048 || /^(?:data|blob):/i.test(value)) return undefined;
  try {
    const parsed = new URL(value, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch { return undefined; }
}

function itemFingerprint(item: MenuItemData): string {
  return createHash("sha256").update(JSON.stringify([
    normalizeMenuItemName(item.name), item.description?.trim() || null, item.price ?? null, item.imageUrl ?? null,
  ])).digest("hex");
}

function itemSource(item: MenuItemData, platforms: OrderingPlatform[]): string {
  return item.source ?? platforms[0] ?? "schema_org";
}

export function chooseAdaptiveRoute(input: {
  httpOk: boolean;
  blocked: boolean;
  htmlLength: number;
  itemCount: number;
  platforms: OrderingPlatform[];
  renderedAlready: boolean;
}): Array<"curl_cffi" | "patchright" | "scrapling" | "crawl4ai"> {
  if (!input.httpOk || input.blocked) return ["curl_cffi", "patchright", "scrapling"];
  if (!input.renderedAlready && (input.platforms.length > 0 || input.htmlLength < 2_000 || input.itemCount === 0)) {
    return ["patchright"];
  }
  if (input.itemCount === 0) return ["crawl4ai"];
  return [];
}

function parseHtml(url: string, html: string, method: string) {
  const platforms = detectOrderingPlatforms(html);
  const assets = extractPageAssets(html, url);
  const items: WebsiteItemEvidence[] = [];
  const add = (batch: MenuItemData[], suffix: string, confidence: number) => {
    for (const raw of batch) {
      const name = raw.name?.trim();
      if (!name || name.length > 140) continue;
      const item = { ...raw, name, imageUrl: safePublicUrl(raw.imageUrl, url) };
      items.push({
        item,
        method: `${method}:${suffix}`,
        evidenceUrl: url,
        confidence,
        sourceKey: itemSource(item, platforms),
        fingerprint: itemFingerprint(item),
      });
    }
  };
  add(parseSchemaOrgMenuItems(html), "schema_org", 0.95);
  add(parseVisibleMenuItems(html), "visible_menu", 0.8);
  for (const platform of platforms) add(extractEmbeddedJsonMenuItems(html, platform), `platform_${platform}`, 0.93);
  return {
    items,
    platforms,
    photos: assets.photoUrls.flatMap((value) => safePublicUrl(value, url) ?? []),
    pdfs: assets.pdfUrls.flatMap((value) => safePublicUrl(value, url) ?? []),
    links: assets.pageUrls.flatMap((value) => safePublicUrl(value, url) ?? []),
  };
}

function addNetworkItems(
  parsed: ReturnType<typeof parseHtml>,
  payloads: unknown[],
  method: string,
  url: string,
) {
  for (const raw of parseCapturedMenuPayloads(payloads)) {
    const item = { ...raw, imageUrl: safePublicUrl(raw.imageUrl, url) };
    parsed.items.push({
      item,
      method: `${method}:network_json`,
      evidenceUrl: url,
      confidence: 0.96,
      sourceKey: itemSource(item, parsed.platforms),
      fingerprint: itemFingerprint(item),
    });
  }
}

function mergeEvidence(input: WebsiteItemEvidence[]): WebsiteItemEvidence[] {
  const best = new Map<string, WebsiteItemEvidence>();
  for (const evidence of input) {
    const key = `${normalizeMenuItemName(evidence.item.name)}|${evidence.item.price ?? ""}`;
    const quality = evidence.confidence + Number(Boolean(evidence.item.description)) * 0.1 + Number(Boolean(evidence.item.imageUrl)) * 0.2;
    const current = best.get(key);
    const currentQuality = current ? current.confidence + Number(Boolean(current.item.description)) * 0.1 + Number(Boolean(current.item.imageUrl)) * 0.2 : -1;
    if (!current || quality > currentQuality) best.set(key, evidence);
  }
  return [...best.values()].slice(0, 800);
}

async function directFetch(url: string): Promise<PythonFetchResult & { method: string }> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(18_000),
    });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 10 * 1024 * 1024) return { ok: false, status: response.status, error: "page_too_large", method: "http" };
    const html = await response.text();
    if (html.length > 10 * 1024 * 1024) return { ok: false, status: response.status, error: "page_too_large", method: "http" };
    return { ok: response.ok && !BLOCKED.test(html), status: response.status, html, finalUrl: response.url, error: BLOCKED.test(html) ? "access_blocked" : undefined, method: "http" };
  } catch (error) {
    return { ok: false, status: null, error: String(error instanceof Error ? error.message : error), method: "http" };
  }
}

async function alternateFetch(url: string, method: "curl_cffi" | "patchright" | "scrapling" | "crawl4ai") {
  const result = await pythonFetchAsync(url, {
    render: method !== "curl_cffi",
    engine: method === "curl_cffi" ? undefined : method,
    timeoutSec: method === "crawl4ai" ? 50 : 35,
    waitMs: method === "patchright" ? 1_500 : 0,
    captureMenuJson: method === "patchright",
  });
  return { ...result, method };
}

export async function crawlWebsiteV3(
  target: WebsiteV3Target,
  options: { renderEnabled: boolean; maxPages?: number; deepDiscovery?: boolean } = { renderEnabled: true },
): Promise<WebsiteV3Result> {
  const started = Date.now();
  const maxPages = Math.min(8, Math.max(1, options.maxPages ?? 5));
  const queue = [target.url], queued = new Set(queue), visited = new Set<string>();
  const allItems: WebsiteItemEvidence[] = [], photos = new Set<string>(), pdfs = new Set<string>();
  const platforms = new Set<OrderingPlatform>(), methods = new Set<string>(), routeDecisions: string[] = [], pages: PageEvidence[] = [];
  let blocked = false, lastError: string | undefined;

  while (queue.length && visited.size < maxPages) {
    const requestedUrl = queue.shift()!;
    if (visited.has(requestedUrl)) continue;
    visited.add(requestedUrl);
    let fetched = await directFetch(requestedUrl);
    methods.add("http");
    let finalUrl = fetched.finalUrl ?? requestedUrl;
    let parsed = fetched.ok && fetched.html ? parseHtml(finalUrl, fetched.html, "http") : null;
    let chosenHtml = fetched.html ?? "";
    if (fetched.error === "access_blocked") blocked = true;

    if (options.renderEnabled && visited.size <= 2) {
      let route = chooseAdaptiveRoute({
        httpOk: fetched.ok,
        blocked: fetched.error === "access_blocked",
        htmlLength: fetched.html?.length ?? 0,
        itemCount: parsed?.items.length ?? 0,
        platforms: parsed?.platforms ?? [],
        renderedAlready: false,
      });
      for (const method of route) {
        routeDecisions.push(`${requestedUrl}:${method}`);
        const alternative = await alternateFetch(requestedUrl, method);
        methods.add(method);
        if (alternative.error === "access_blocked") blocked = true;
        if (!alternative.ok || !alternative.html) { lastError = alternative.error ?? lastError; continue; }
        const alternativeUrl = alternative.finalUrl ?? requestedUrl;
        const candidate = parseHtml(alternativeUrl, alternative.html, method);
        if (method === "patchright") addNetworkItems(candidate, alternative.payloads ?? [], method, alternativeUrl);
        if (method === "crawl4ai" && alternative.markdown) {
          for (const item of parseMenuText(alternative.markdown)) {
            candidate.items.push({ item, method: "crawl4ai:markdown_menu", evidenceUrl: alternativeUrl, confidence: 0.78, sourceKey: "menu_ocr", fingerprint: itemFingerprint(item) });
          }
        }
        if (!parsed || candidate.items.length > parsed.items.length || method === "curl_cffi") {
          parsed = candidate;
          fetched = alternative;
          chosenHtml = alternative.html;
          finalUrl = alternativeUrl;
        }
        for (const link of alternative.links ?? []) {
          const safe = safePublicUrl(link, alternativeUrl);
          if (safe && queued.size < 16 && !queued.has(safe)) { queued.add(safe); queue.push(safe); }
        }
        if (candidate.items.length > 0) break;
        if (options.deepDiscovery && method === "patchright" && route.length === 1) {
          route = ["crawl4ai"];
          routeDecisions.push(`${requestedUrl}:crawl4ai_discovery`);
          const discovery = await alternateFetch(requestedUrl, "crawl4ai");
          methods.add("crawl4ai");
          for (const link of discovery.links ?? []) {
            const safe = safePublicUrl(link, discovery.finalUrl ?? requestedUrl);
            if (safe && queued.size < 16 && !queued.has(safe)) { queued.add(safe); queue.push(safe); }
          }
        }
      }
    }

    if (!fetched.ok || !chosenHtml || !parsed) {
      pages.push({ requestedUrl, finalUrl, method: fetched.method, status: fetched.status, itemCount: 0, platformCount: 0 });
      lastError = fetched.error ?? lastError;
      continue;
    }
    pages.push({
      requestedUrl,
      finalUrl,
      method: fetched.method,
      status: fetched.status,
      sha256: createHash("sha256").update(chosenHtml).digest("hex"),
      itemCount: parsed.items.length,
      platformCount: parsed.platforms.length,
    });
    parsed.items.forEach((item) => allItems.push(item));
    parsed.photos.forEach((photo) => photos.add(photo));
    parsed.pdfs.forEach((pdf) => pdfs.add(pdf));
    parsed.platforms.forEach((platform) => platforms.add(platform));
    for (const link of parsed.links) {
      if (queued.size >= 16) break;
      if (!queued.has(link)) { queued.add(link); queue.push(link); }
    }
  }

  const items = mergeEvidence(allItems);
  const linkedPhotos = [...new Set(items.flatMap((evidence) => evidence.item.imageUrl ? [evidence.item.imageUrl] : []))];
  const status = items.length || linkedPhotos.length ? "completed" : blocked ? "blocked" : pages.length ? "empty" : "failed";
  return {
    status,
    items,
    genericPhotos: [...photos].slice(0, 160),
    linkedPhotos,
    pdfUrls: [...pdfs].slice(0, 10),
    pages,
    platforms: [...platforms],
    methods: [...methods],
    routeDecisions,
    elapsedMs: Date.now() - started,
    error: lastError,
  };
}
