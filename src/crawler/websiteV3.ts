import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
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
  menuImageUrls: string[];
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
const MENU_URL_HINT = /(?:^|[\/_-])(?:food[-_]?menu|menus?|order(?:ing|-online)?)(?:[\/_-]|$)/i;
const NON_DISH_TEXT = /^(?:menus?|home|locations?|contact|about|catering|order(?: online)?|reservations?|gift cards?|more|specials?|choose (?:a|your)|add-ons?|sides?|drinks?|breakfast|brunch|lunch|dinner)$/i;
const ORDERING_HOST = /(?:^|\.)(?:toasttab\.com|square\.site|squareup\.com|clover\.com|cloveronline\.com|chownow\.com|olo\.com|popmenu\.com|owner\.com|spothopper\.com|slicelife\.com|flipdish\.com|lightspeed\.app|gloriafood\.com|menufy\.com|mybistro\.online)$/i;
const PLATFORM_MARKETING_HOST = /^(?:(?:www|get|go|blog|help|support|marketing)\.)?(?:popmenu\.com|owner\.com|spothopper\.com|menufy\.com)$/i;
const GENERIC_RESTAURANT_WORD = /^(?:and|bar|cafe|cantina|cocina|food|grill|kitchen|mexican|restaurant|restaurants|the|temecula)$/;

export function normalizeMenuItemName(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function safePublicUrl(value: string | undefined, base?: string): string | undefined {
  if (!value || value.length > 2_048 || /^(?:data|blob):/i.test(value)) return undefined;
  try {
    const parsed = new URL(value, base);
    parsed.hash = "";
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch { return undefined; }
}

/** Keep discovery attached to the restaurant or a consumer ordering storefront. */
export function isTrustedCrawlUrl(value: string, rootValue: string, restaurantName?: string): boolean {
  try {
    const candidate = new URL(value), root = new URL(rootValue);
    const candidateHost = candidate.hostname.toLowerCase().replace(/^www\./, "");
    const rootHost = root.hostname.toLowerCase().replace(/^www\./, "");
    if (candidateHost === rootHost || candidateHost.endsWith(`.${rootHost}`) || rootHost.endsWith(`.${candidateHost}`)) return true;
    const candidateBrand=candidateHost.split(".")[0].replace(/[^a-z0-9]/g,"");
    const rootBrand=rootHost.split(".")[0].replace(/[^a-z0-9]/g,"");
    if(candidateBrand.length>=8&&candidateBrand===rootBrand)return true;
    if (!ORDERING_HOST.test(candidate.hostname) || PLATFORM_MARKETING_HOST.test(candidate.hostname)) return false;
    const storefront = /(?:^|[\/_-])(?:menu|order|ordering|store|restaurant)(?:[\/_-]|$)/i.test(candidate.pathname)
      || /^(?:order|ordering|shop|store)\./i.test(candidate.hostname)
      || /(?:^|\.)(?:cloveronline\.com|mybistro\.online)$/i.test(candidate.hostname);
    if (!storefront) return false;
    if (!restaurantName) return true;
    const haystack=normalizeMenuItemName(decodeURIComponent(`${candidate.hostname} ${candidate.pathname}`));
    const tokens=normalizeMenuItemName(restaurantName.replace(/([a-z])([A-Z])/g,"$1 $2")).split(" ").filter(token=>(token.length>=4||/^\d{3,}$/.test(token))&&!GENERIC_RESTAURANT_WORD.test(token));
    return tokens.length===0 || tokens.some(token=>haystack.includes(token));
  } catch { return false; }
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function plausibleDishName(value: string): boolean {
  if (value.length < 2 || value.length > 110 || NON_DISH_TEXT.test(value) || /\$\s*\d|\b\d{1,3}\.\d{2}\b/.test(value)) return false;
  const letters = value.match(/[A-Za-z]/g)?.length ?? 0;
  if (letters < 2 || value.split(/\s+/).length > 14) return false;
  return !/^(?:served|topped|with|includes?|choice of|available|please|prices?|copyright|follow us)/i.test(value);
}

/** Recover ordinary visual menus whose builders use generated CSS classes. */
export function parseLooseMenuDom(html: string): MenuItemData[] {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,nav,footer,header").remove();
  const structured: Array<{ value: string; heading: boolean }> = [];
  $("h1,h2,h3,h4,h5,h6,p,li,[role='listitem']").each((_, element) => {
    const node = $(element);
    if (node.parents("nav,footer,header").length) return;
    const value = cleanText(node.clone().children().remove().end().text()) || cleanText(node.text());
    if (!value || value.length > 500 || structured.at(-1)?.value === value) return;
    structured.push({ value, heading: /^h[1-6]$/i.test(element.tagName) });
  });
  const priceOnly = /^\$\s*(\d{1,4}(?:\.\d{2})?)$/;
  const inline = /^(.{2,110}?)\s+(?:\$\s*)?(\d{1,3}\.\d{2})$/;
  const parseLines = (lines:Array<{value:string;heading:boolean}>) => {
    const results: MenuItemData[]=[];
    for (let index = 0; index < lines.length; index++) {
      const inlineMatch = lines[index].value.match(inline);
      if (inlineMatch && plausibleDishName(inlineMatch[1])) { results.push({ name:inlineMatch[1].trim(),price:Number(inlineMatch[2]),source:"schema_org" });continue; }
      const priceMatch = lines[index].value.match(priceOnly);if(!priceMatch)continue;
      const previous=lines[index-1]??{value:"",heading:false},beforePrevious=lines[index-2]??{value:"",heading:false};
      const name=beforePrevious.heading&&plausibleDishName(beforePrevious.value)?beforePrevious.value
        :plausibleDishName(previous.value)?previous.value:plausibleDishName(beforePrevious.value)?beforePrevious.value:"";
      if(!name)continue;
      results.push({name,price:Number(priceMatch[1]),description:name===beforePrevious.value&&previous.value.length<=500?previous.value:undefined,source:"schema_org"});
    }
    return results;
  };
  const raw = $("body").text().split(/\r?\n/).map(cleanText).filter(value=>value&&value.length<=500).map(value=>({value,heading:false}));
  const parsed = [parseLines(structured),parseLines(raw)].sort((a,b)=>b.length-a.length)[0];
  const deduped = new Map<string, MenuItemData>();
  for (const item of parsed) if (!deduped.has(normalizeMenuItemName(item.name))) deduped.set(normalizeMenuItemName(item.name), item);
  return deduped.size >= 4 ? [...deduped.values()].slice(0, 800) : [];
}

/** Recover visually explicit, price-free menus (common on Wix/Squarespace). */
export function parseUnpricedMenuDom(html: string): MenuItemData[] {
  const $=cheerio.load(html),items:MenuItemData[]=[];
  $("script,style,noscript,svg,nav,footer,header").remove();
  $("h3,h4,h5,[style*='font-size']").each((_,element)=>{
    const node=$(element),value=cleanText(node.clone().children().remove().end().text())||cleanText(node.text());
    if(!plausibleDishName(value))return;
    const style=node.attr("style")??"",size=Number(style.match(/font-size:\s*(\d+(?:\.\d+)?)px/i)?.[1]??0);
    const heading=/^h[3-5]$/i.test(element.tagName);
    if(!heading&&size<18)return;
    items.push({name:value,source:"schema_org"});
  });
  const deduped=new Map<string,MenuItemData>();for(const item of items)if(!deduped.has(normalizeMenuItemName(item.name)))deduped.set(normalizeMenuItemName(item.name),item);
  return deduped.size>=5?[...deduped.values()].slice(0,500):[];
}

/** Recover menus whose templates explicitly label dish-name fields but omit prices. */
export function parseSemanticMenuDom(html:string):MenuItemData[]{
  const $=cheerio.load(html),items:MenuItemData[]=[];
  const add=(nameValue:string,descriptionValue?:string)=>{const name=cleanText(nameValue).replace(/^[•·▪◦*-]+\s*/,""),description=cleanText(descriptionValue??"");if(!plausibleDishName(name))return;items.push({name,description:description&&description!==name&&description.length<=500?description:undefined,source:"schema_org"});};
  $(".dishName,.dish-name,.itemName,.item-name,.menu-item-name,.product-name,[data-testid*='item-name']").each((_,element)=>{
    const node=$(element),container=node.closest("li,article,.menu-item,.menu_item,.product,.dish");
    add(node.text(),container.find(".dishDescription,.dish-description,.item-description,.menu-item-description,.description,p").first().text());
  });
  $(".menu-text,.menu_item,.menu-item").each((_,element)=>{
    const card=$(element),bullets=card.find("h6");
    if(bullets.length>1){bullets.each((__,bullet)=>add($(bullet).text()));return;}
    const heading=card.find("h3,h4").first(),description=card.find("h5,p").first();
    if(heading.length)add(heading.text(),description.text());
  });
  const deduped=new Map<string,MenuItemData>();for(const item of items){const key=normalizeMenuItemName(item.name);if(!deduped.has(key))deduped.set(key,item);}
  return deduped.size>=3?[...deduped.values()].slice(0,800):[];
}

export function discoverMenuImages(html: string, baseUrl: string, menuContext: boolean): string[] {
  const $ = cheerio.load(html), candidates: Array<{ url: string; score: number }> = [];
  $("img").each((_, element) => {
    const node = $(element);
    // Builders such as Squarespace keep the original menu document in
    // `data-image` while `src` may be an aggressively downscaled thumbnail.
    const raw = node.attr("data-image") ?? node.attr("data-src") ?? node.attr("data-lazy-src") ?? node.attr("src");
    const url = safePublicUrl(raw, baseUrl);
    if (!url || /logo|icon|favicon|avatar|social|badge|button|tracking|\.svg(?:\?|$)/i.test(url)) return;
    const filename=decodeURIComponent(new URL(url).pathname.split("/").pop()??"").replace(/\+/g," ");
    const alternate=`${node.attr("alt")??""} ${node.attr("title")??""}`;
    const menuNamed=/(?:^|[^a-z])(?:food|drink|dinner|lunch|breakfast|brunch|happy[ _-]?hour)?[ _-]*menu(?:[ _-]*(?:booklet|page|\d))?(?:[^a-z]|$)/i.test(`${filename} ${alternate}`);
    const numberedDocument=menuContext&&/^\d{1,2}\.(?:png|jpe?g|webp)$/i.test(filename);
    const dimensions=(node.attr("data-image-dimensions")??"").match(/^(\d+)x(\d+)$/i);
    const width = Number(node.attr("width") ?? dimensions?.[1] ?? 0), height = Number(node.attr("height") ?? dimensions?.[2] ?? 0);
    const large = width >= 600 || height >= 800;
    if (!(menuNamed && menuContext) && !numberedDocument) return;
    candidates.push({ url, score: (menuNamed ? 100 : 0) + (numberedDocument?60:0) + (large ? 30 : 0) });
  });
  return [...new Set(candidates.sort((a,b)=>b.score-a.score).map(candidate=>candidate.url))].slice(0, 8);
}

function discoverMenuContextLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html), base = new URL(baseUrl), links: Array<{ url: string; score: number }> = [];
  $("a[href]").each((_, element) => {
    const node = $(element), url = safePublicUrl(node.attr("href"), baseUrl);
    if (!url) return;
    const parsed = new URL(url);
    if (parsed.origin !== base.origin || parsed.href === base.href) return;
    const label = cleanText(`${node.text()} ${parsed.pathname}`);
    if (/privacy|terms|legal|contact|about|careers?|jobs?|franchis|blog|news|gallery|social|account|cart|checkout|gift/i.test(label)) return;
    const score = (MENU_URL_HINT.test(parsed.pathname) ? 100 : 0)
      + (/southern california|temecula|california|dinner|lunch|breakfast|brunch|main/i.test(label) ? 50 : 0)
      - parsed.pathname.split("/").length;
    links.push({ url: parsed.href, score });
  });
  return [...new Set(links.sort((a,b)=>b.score-a.score).map(link=>link.url))].slice(0, 6);
}

export function parseSitemapMenuLinks(xml: string, rootUrl: string, restaurantName?: string): string[] {
  const links:string[]=[];
  for(const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)){
    const value=match[1].replace(/&amp;/g,"&"),safe=safePublicUrl(value,rootUrl);
    if(!safe||!MENU_URL_HINT.test(new URL(safe).pathname)||!isTrustedCrawlUrl(safe,rootUrl,restaurantName))continue;
    links.push(safe);
  }
  return [...new Set(links)].slice(0,8);
}

async function discoverSitemapMenuLinks(rootUrl:string,restaurantName:string):Promise<string[]>{
  try{
    const root=new URL(rootUrl),sitemapUrl=`${root.origin}/sitemap.xml`;
    const response=await fetch(sitemapUrl,{headers:{accept:"application/xml,text/xml;q=0.9,*/*;q=0.5"},signal:AbortSignal.timeout(10_000)});
    if(!response.ok)return[];const xml=await response.text(),direct=parseSitemapMenuLinks(xml,rootUrl,restaurantName);
    if(direct.length)return direct;
    const childSitemaps=[...xml.matchAll(/<loc>\s*([^<]*sitemap[^<]*)<\/loc>/gi)].map(match=>safePublicUrl(match[1].replace(/&amp;/g,"&"),sitemapUrl)).filter(Boolean).slice(0,4) as string[];
    const found:string[]=[];
    for(const child of childSitemaps){try{const childResponse=await fetch(child,{headers:{accept:"application/xml,text/xml;q=0.9,*/*;q=0.5"},signal:AbortSignal.timeout(8_000)});if(childResponse.ok)found.push(...parseSitemapMenuLinks(await childResponse.text(),rootUrl,restaurantName));}catch{}}
    return [...new Set(found)].slice(0,8);
  }catch{return[];}
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
  if (!input.httpOk || input.blocked) return ["curl_cffi", "patchright"];
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
  const semantic=parseSemanticMenuDom(html);
  add(semantic,"semantic_menu_dom",0.84);
  const menuContext = MENU_URL_HINT.test(new URL(url).pathname) || /<title[^>]*>[^<]*menu/i.test(html)
    || /(?:id|class)=["'][^"']*\bmenu\b[^"']*["']/i.test(html)
    || /<h[1-4][^>]*>\s*(?:our\s+)?menu\s*<\/h[1-4]>/i.test(html);
  if (menuContext) {
    const loose=parseLooseMenuDom(html);
    add(loose,"loose_menu_dom",0.86);
    if(!semantic.length&&!loose.length)add(parseUnpricedMenuDom(html),"unpriced_visual_menu",0.74);
  }
  for (const platform of platforms) add(extractEmbeddedJsonMenuItems(html, platform), `platform_${platform}`, 0.93);
  return {
    items,
    platforms,
    photos: assets.photoUrls.flatMap((value) => safePublicUrl(value, url) ?? []),
    pdfs: assets.pdfUrls.flatMap((value) => safePublicUrl(value, url) ?? []),
    links: [...assets.pageUrls.flatMap((value) => safePublicUrl(value, url) ?? []), ...(menuContext ? discoverMenuContextLinks(html,url) : [])],
    menuImages: discoverMenuImages(html, url, menuContext),
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
  const allItems: WebsiteItemEvidence[] = [], photos = new Set<string>(), menuImages = new Set<string>(), pdfs = new Set<string>();
  const platforms = new Set<OrderingPlatform>(), methods = new Set<string>(), routeDecisions: string[] = [], pages: PageEvidence[] = [];
  let blocked = false, lastError: string | undefined;

  while (queue.length && visited.size < maxPages) {
    const requestedUrl = queue.shift()!;
    if (visited.has(requestedUrl)) continue;
    visited.add(requestedUrl);
    let fetched = await directFetch(requestedUrl);
    methods.add("http");
    let finalUrl = fetched.finalUrl ?? requestedUrl;
    if (fetched.ok && !isTrustedCrawlUrl(finalUrl, target.url,target.restaurantName)) {
      pages.push({ requestedUrl, finalUrl, method: fetched.method, status: fetched.status, itemCount: 0, platformCount: 0 });
      lastError = "untrusted_cross_domain_redirect";
      continue;
    }
    let parsed = fetched.ok && fetched.html ? parseHtml(finalUrl, fetched.html, "http") : null;
    let chosenHtml = fetched.html ?? "";
    if (fetched.error === "access_blocked") blocked = true;

    if (options.renderEnabled && (visited.size <= 2 || MENU_URL_HINT.test(new URL(requestedUrl).pathname))) {
      let route = chooseAdaptiveRoute({
        httpOk: fetched.ok,
        blocked: fetched.error === "access_blocked",
        htmlLength: fetched.html?.length ?? 0,
        itemCount: parsed?.items.length ?? 0,
        platforms: parsed?.platforms ?? [],
        renderedAlready: false,
      });
      const isGuessedConventionalPath=requestedUrl!==target.url&&/^\/(?:menu|menus|food-menu)\/?$/i.test(new URL(requestedUrl).pathname);
      if(isGuessedConventionalPath&&fetched.status===404)route=[];
      for (const method of route) {
        routeDecisions.push(`${requestedUrl}:${method}`);
        const alternative = await alternateFetch(requestedUrl, method);
        methods.add(method);
        if (alternative.error === "access_blocked") blocked = true;
        if (!alternative.ok || !alternative.html) { lastError = alternative.error ?? lastError; continue; }
        const alternativeUrl = alternative.finalUrl ?? requestedUrl;
        if (!isTrustedCrawlUrl(alternativeUrl, target.url,target.restaurantName)) { lastError = "untrusted_cross_domain_redirect"; continue; }
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
          if (safe && isTrustedCrawlUrl(safe,target.url,target.restaurantName) && queued.size < 16 && !queued.has(safe)) { queued.add(safe); queue.push(safe); }
        }
        if (candidate.items.length > 0) break;
        if (options.deepDiscovery && method === "patchright" && route.length === 1) {
          route = ["crawl4ai"];
          routeDecisions.push(`${requestedUrl}:crawl4ai_discovery`);
          const discovery = await alternateFetch(requestedUrl, "crawl4ai");
          methods.add("crawl4ai");
          for (const link of discovery.links ?? []) {
            const safe = safePublicUrl(link, discovery.finalUrl ?? requestedUrl);
            if (safe && isTrustedCrawlUrl(safe,target.url,target.restaurantName) && queued.size < 16 && !queued.has(safe)) { queued.add(safe); queue.push(safe); }
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
    parsed.menuImages.forEach((photo) => menuImages.add(photo));
    parsed.pdfs.forEach((pdf) => pdfs.add(pdf));
    parsed.platforms.forEach((platform) => platforms.add(platform));
    for (const link of parsed.links) {
      if (queued.size >= 16) break;
      if (isTrustedCrawlUrl(link,target.url,target.restaurantName) && !queued.has(link)) { queued.add(link); queue.push(link); }
    }
    // Many chain/location sites expose a conventional menu route but omit it
    // from the server-rendered navigation. Probe only a tiny same-origin set.
    if (visited.size === 1 && parsed.items.length === 0 && !parsed.links.some(link=>MENU_URL_HINT.test(new URL(link).pathname))) {
      const origin=new URL(target.url).origin;
      const sitemapLinks=await discoverSitemapMenuLinks(target.url,target.restaurantName);
      for(const candidate of [...sitemapLinks].reverse()){if(!queued.has(candidate)){queued.add(candidate);queue.unshift(candidate);}}
      for(const path of ["/menu","/menus","/food-menu"]){const candidate=`${origin}${path}`;if(queued.size<16&&!queued.has(candidate)){queued.add(candidate);queue.push(candidate);}}
    }
  }

  const items = mergeEvidence(allItems);
  const linkedPhotos = [...new Set(items.flatMap((evidence) => evidence.item.imageUrl ? [evidence.item.imageUrl] : []))];
  const status = items.length || linkedPhotos.length || menuImages.size ? "completed" : blocked ? "blocked" : pages.length ? "empty" : "failed";
  return {
    status,
    items,
    genericPhotos: [...photos].slice(0, 160),
    linkedPhotos,
    menuImageUrls: [...menuImages],
    pdfUrls: [...pdfs].slice(0, 10),
    pages,
    platforms: [...platforms],
    methods: [...methods],
    routeDecisions,
    elapsedMs: Date.now() - started,
    error: lastError,
  };
}
