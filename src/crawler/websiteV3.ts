import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
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
  restaurantAddress?: string;
  marketKeys?: string[];
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

export type NamedWebsitePhoto = {
  url: string;
  label: string;
  evidenceUrl: string;
  method: string;
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
  namedPhotos: NamedWebsitePhoto[];
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
const NON_DISH_TEXT = /^(?:menus?|home|locations?|contact|about|catering|delivery|pickup|order(?: online)?|reservations?|gift cards?|more|specials?|choose (?:a|your)|add-ons?|appetizers?|entrees?|salsas?|sides?|desserts?|drinks?|breakfast|brunch|lunch|dinner)$/i;
const ORDERING_HOST = /(?:^|\.)(?:toasttab\.com|square\.site|squareup\.com|clover\.com|cloveronline\.com|chownow\.com|olo\.com|popmenu\.com|owner\.com|spothopper\.com|slicelife\.com|flipdish\.com|lightspeed\.app|gloriafood\.com|menufy\.com|mybistro\.online)$/i;
const PLATFORM_MARKETING_HOST = /^(?:(?:www|get|go|blog|help|support|marketing)\.)?(?:popmenu\.com|owner\.com|spothopper\.com|menufy\.com)$/i;
const GENERIC_RESTAURANT_WORD = /^(?:and|bar|cafe|cantina|cocina|food|grill|kitchen|mexican|restaurant|restaurants|the|temecula)$/;
const NON_FOOD_PHOTO_LABEL = /(?:^|\b)(?:apparel|arcade|bar|bartender|banner|bottled water|building|coca cola|cocktails?|delivery|dining|drinks?|event|exterior|facebook|front|hoodies?|instagram|interior|locker room|logo|merch(?:andise)?|milk|people|powerade|reservation|shirts?|social|soda|staff|storefront|team|tees?|tiktok|twitter|uniform|wine)(?:\b|$)/i;
const PHOTO_LABEL_NOISE = /(?:\b(?:copy|enhanced|final|hero|image|img|new|photo|web)\b|\(\d+\)|\b(?:small plate|entree|sandwich|dessert|starter|main|side)\s*[-_:])/gi;
const DISH_MODIFIER = new Set(["blistered","braised","charred","classic","crispy","fresh","fried","grilled","house","roasted","seared","smoked","spicy","toasted","wax"]);

/** Prefer the real asset used by common lazy-loading site builders. */
function imageSource(node: cheerio.Cheerio<Element>): string | undefined {
  return node.attr("data-image")
    ?? node.attr("data-src")
    ?? node.attr("data-lazy-src")
    ?? node.attr("data-original")
    ?? node.attr("data-srclazy")
    ?? node.attr("data-lazy")
    ?? node.attr("data-url")
    ?? node.attr("src");
}

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

/** Collapse common responsive image renditions to their stable original asset. */
export function canonicalizeWebsiteImageUrl(value: string, base?: string): string | undefined {
  const safe = safePublicUrl(value, base);
  if (!safe) return undefined;
  const parsed = new URL(safe);
  if (/(?:^|\.)squarespace-cdn\.com$/i.test(parsed.hostname) || /(?:^|\.)squarespace\.com$/i.test(parsed.hostname)) {
    for (const parameter of ["format", "width", "w", "height", "h", "quality", "q", "fit", "crop", "dpr"]) {
      parsed.searchParams.delete(parameter);
    }
  }
  if (/(?:^|\.)static\.wixstatic\.com$/i.test(parsed.hostname)) {
    const originalPath = parsed.pathname.match(/^(\/media\/[^/]+)(?:\/v1\/.*)?$/i)?.[1];
    if (originalPath) parsed.pathname = originalPath;
    parsed.search = "";
  }
  if (/(?:^|\.)wsimg\.com$/i.test(parsed.hostname)) {
    // GoDaddy appends crop/resize instructions after the actual filename.
    // Keeping them creates duplicate assets and hides the meaningful filename
    // from menu-document detection.
    parsed.pathname = parsed.pathname.replace(/\/:\/(?:cr|rs)=.*$/i, "");
    parsed.search = "";
  }
  return parsed.href;
}

function normalizePhotoLabel(value: string): string {
  return normalizeMenuItemName(value
    .replace(/\.[a-z0-9]{2,5}(?:\?.*)?$/i, "")
    .replace(/[_+]+/g, " ")
    .replace(PHOTO_LABEL_NOISE, " "))
    .split(" ")
    .filter(token=>token!=="mv2"&&!/^\d+x\d+$/.test(token)&&!/^[a-f0-9]{12,}$/.test(token))
    .join(" ")
    .replace(/\b(?:overhead|enhanced)\b/g," ")
    .replace(/\s+/g," ").trim();
}

/** Extract only explicitly labelled image candidates; unknown gallery photos stay generic. */
export function extractNamedWebsitePhotos(html: string, pageUrl: string, method = "http"): NamedWebsitePhoto[] {
  const $ = cheerio.load(html), candidates = new Map<string, NamedWebsitePhoto>();
  $("img").each((_, element) => {
    const node = $(element);
    const raw = imageSource(node);
    const url = raw ? canonicalizeWebsiteImageUrl(raw, pageUrl) : undefined;
    if (!url || /logo|icon|favicon|avatar|social|badge|button|tracking|\.svg(?:\?|$)/i.test(url)) return;
    let filename = "";
    try {
      const rawPath = new URL(safePublicUrl(raw, pageUrl) ?? url).pathname;
      filename = decodeURIComponent(
        rawPath.split("/").filter((segment) => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(segment)).at(-1)
          ?? new URL(url).pathname.split("/").pop()
          ?? ""
      );
    } catch {}
    // A photographed/scanned menu is an OCR input, not a dish photo.
    if (/(?:^|[^a-z])menu(?:[^a-z]|$)/i.test(filename)) return;
    const caption = node.closest("figure").find("figcaption").first().text();
    const explicitLabels=[node.attr("alt"),node.attr("title"),node.attr("aria-label"),caption]
      .flatMap(value=>value?[normalizePhotoLabel(value)]:[])
      .filter(value=>value&&!/^(?:image|photo|gallery image)$/.test(value));
    const filenameLabel=normalizePhotoLabel(filename);
    const normalized=[...new Set(explicitLabels)].sort((left,right)=>left.length-right.length)[0]??filenameLabel;
    if (!normalized || normalized.length < 3 || NON_FOOD_PHOTO_LABEL.test(normalized)
      || /^(?:dsc|img|image)?\s*\d{5,}$/i.test(normalized)
      || /^(?:frame|image|img|lto|map|header)\s*\d*$/i.test(normalized)
      || /^(?:[a-f0-9]{12,}|[a-z0-9]{24,})$/i.test(normalized)) return;
    const existing = candidates.get(url);
    if (!existing || normalized.length < normalizePhotoLabel(existing.label).length) {
      candidates.set(url, { url, label: normalized, evidenceUrl: pageUrl, method });
    }
  });
  return [...candidates.values()].slice(0, 160);
}

export function namedPhotoDishMatchScore(photoLabel: string, dishName: string): number {
  const aliases = (value:string) => normalizeMenuItemName(value).split(" ").map(token=>token==="avo"?"avocado":token).join(" ");
  const photo = aliases(normalizePhotoLabel(photoLabel)), dish = aliases(dishName);
  if (!photo || !dish || NON_FOOD_PHOTO_LABEL.test(photo)||NON_DISH_TEXT.test(dish)||dish.split(" ").length>10) return 0;
  if (photo === dish) return 100;
  if (dish.length >= 6 && photo.includes(dish) && photo.length - dish.length <= 24) return 90;
  if (photo.length >= 6 && dish.includes(photo) && dish.length - photo.length <= 16) return 88;
  const ignored = new Set(["and", "the", "with", "style"]);
  const photoTokens = new Set(photo.split(" ").filter((token) => token.length > 1 && !ignored.has(token)));
  const dishTokens = new Set(dish.split(" ").filter((token) => token.length > 1 && !ignored.has(token)));
  const sharedTokens = [...dishTokens].filter((token) => photoTokens.has(token));
  const photoOnly=[...photoTokens].filter(token=>!dishTokens.has(token));
  const dishOnly=[...dishTokens].filter(token=>!photoTokens.has(token));
  const modifierOnly=[...photoOnly,...dishOnly].every(token=>DISH_MODIFIER.has(token));
  return sharedTokens.length >= 2 && modifierOnly && photoOnly.length <= 1 && dishOnly.length <= 1 ? 85 : 0;
}

/** Attach at most one clearly labelled official image to each known menu dish. */
export function attachNamedPhotosToMenuItems(items: WebsiteItemEvidence[], photos: NamedWebsitePhoto[]): WebsiteItemEvidence[] {
  const unused = [...photos];
  return items.map((evidence) => {
    if (evidence.item.imageUrl) return evidence;
    const matches = unused.filter((photo) => namedPhotoDishMatchScore(photo.label, evidence.item.name) >= 85);
    if (!matches.length) return evidence;
    const match = matches.sort((left, right) =>
      normalizePhotoLabel(left.label).length - normalizePhotoLabel(right.label).length || left.url.localeCompare(right.url)
    )[0];
    unused.splice(unused.indexOf(match), 1);
    const item = { ...evidence.item, imageUrl: match.url };
    return {
      ...evidence,
      item,
      method: `${evidence.method}+${match.method}:named_food_photo`,
      evidenceUrl: match.evidenceUrl,
      confidence: Math.max(evidence.confidence, 0.9),
      fingerprint: itemFingerprint(item),
    };
  });
}

/** Keep discovery attached to the restaurant or a consumer ordering storefront. */
export function isTrustedCrawlUrl(value: string, rootValue: string, restaurantName?: string, restaurantAddress?: string, marketKeys:string[]=[]): boolean {
  try {
    const candidate = new URL(value), root = new URL(rootValue);
    const candidateHost = candidate.hostname.toLowerCase().replace(/^www\./, "");
    const rootHost = root.hostname.toLowerCase().replace(/^www\./, "");
    const sameSite=candidateHost === rootHost || candidateHost.endsWith(`.${rootHost}`) || rootHost.endsWith(`.${candidateHost}`);
    if(sameSite&&restaurantName){
      const location=[...candidate.searchParams.entries()].find(([key])=>/^(?:location|loc|restaurant|store)$/i.test(key))?.[1];
      if(location){
        const words=(text:string)=>new Set(normalizeMenuItemName(text).split(" ").filter(token=>token.length>=4&&!GENERIC_RESTAURANT_WORD.test(token)));
        const targetWords=words(restaurantName), incomingWords=words(location);
        const addressParts=(restaurantAddress??"").split(",").map(part=>part.trim()).filter(Boolean);
        const marketWords=words(marketKeys.join(" ").replace(/\b(?:ca|us|metro|product|corpus)\b/gi," "));
        const cityWords=new Set([...words(addressParts.length>=2?addressParts[1]:""),...marketWords]);
        const incomingExtra=[...incomingWords].filter(token=>!targetWords.has(token));
        const targetLocation=[...new Set([...cityWords,...targetWords])].filter(token=>!incomingWords.has(token));
        if(incomingExtra.length&&targetLocation.length)return false;
      }
      const addressParts=(restaurantAddress??"").split(",").map(part=>part.trim()).filter(Boolean);
      const cityTokens=[...new Set([...normalizeMenuItemName(addressParts.length>=2?addressParts[1]:"").split(" "),...normalizeMenuItemName(marketKeys.join(" ")).split(" ")])]
        .filter(token=>token.length>=4&&!/^(?:metro|product|corpus)$/.test(token));
      const candidatePath=normalizeMenuItemName(decodeURIComponent(candidate.pathname));
      if(/(?:^|\/)(?:locations?|restaurants?|stores?)(?:\/|$)/i.test(candidate.pathname)
        &&cityTokens.length&&!cityTokens.some(token=>candidatePath.includes(token)))return false;
    }
    if (sameSite) return true;
    if (!ORDERING_HOST.test(candidate.hostname) || PLATFORM_MARKETING_HOST.test(candidate.hostname)) return false;
    const storefront = /(?:^|[\/_-])(?:menu|order|ordering|store|restaurant)(?:[\/_-]|$)/i.test(candidate.pathname)
      || /^(?:order|ordering|shop|store)\./i.test(candidate.hostname)
      || /(?:^|\.)(?:cloveronline\.com|mybistro\.online)$/i.test(candidate.hostname);
    if (!storefront) return false;
    if (!restaurantName) return true;
    const haystack=normalizeMenuItemName(decodeURIComponent(`${candidate.hostname} ${candidate.pathname}`));
    const tokens=normalizeMenuItemName(restaurantName.replace(/([a-z])([A-Z])/g,"$1 $2")).split(" ").filter(token=>(token.length>=4||/^\d{3,}$/.test(token))&&!GENERIC_RESTAURANT_WORD.test(token));
    const addressParts=(restaurantAddress??"").split(",").map(part=>part.trim()).filter(Boolean);
    const cityTokens=[...new Set([...normalizeMenuItemName(addressParts.length>=2?addressParts[1]:"").split(" "),...normalizeMenuItemName(marketKeys.join(" ")).split(" ")])]
      .filter(token=>token.length>=4&&!/^(?:metro|product|corpus)$/.test(token));
    if(cityTokens.length&&!cityTokens.some(token=>haystack.includes(token))){
      const routeWords=new Set(["catering","menu","online","order","ordering","restaurant","restaurants","store"]);
      const nameWords=new Set(normalizeMenuItemName(restaurantName).split(" "));
      const extras=haystack.split(" ").filter(token=>token.length>=4&&!nameWords.has(token)&&!routeWords.has(token)&&!candidate.hostname.includes(token));
      if(extras.length)return false;
    }
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
    const value = cleanText(node.contents().toArray().filter(child=>child.type==="text").map(child=>(child as {data?:string}).data??"").join(" ")) || cleanText(node.text());
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
  let raw:Array<{value:string;heading:boolean}>=[];
  try{
    raw=$("body").text().split(/\r?\n/).map(cleanText).filter(value=>value&&value.length<=500).map(value=>({value,heading:false}));
  }catch{
    // Extremely deep, malformed builder markup can overflow domutils' text
    // recursion. The structured heading pass above remains usable.
  }
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
    const node=$(element),value=cleanText(node.contents().toArray().filter(child=>child.type==="text").map(child=>(child as {data?:string}).data??"").join(" "))||cleanText(node.text());
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
    const raw = imageSource(node);
    const url = raw ? canonicalizeWebsiteImageUrl(raw, baseUrl) : undefined;
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
    if (/privacy|terms|legal|contact|about|careers?|jobs?|franchis|blog|news|events?|social|account|cart|checkout|gift|shop|store/i.test(label)) return;
    const mediaContext = /(?:^|[\/_-])(?:galler(?:y|ies)|photos?|food|dishes|cuisine)(?:[\/_-]|$)/i.test(parsed.pathname)
      || /\b(?:gallery|photos?|our food|dishes|cuisine)\b/i.test(label);
    if (!MENU_URL_HINT.test(parsed.pathname) && !mediaContext) return;
    const score = (MENU_URL_HINT.test(parsed.pathname) ? 100 : 0)
      + (mediaContext ? 75 : 0)
      + (/southern california|temecula|california|dinner|lunch|breakfast|brunch|main/i.test(label) ? 50 : 0)
      - parsed.pathname.split("/").length;
    links.push({ url: parsed.href, score });
  });
  return [...new Set(links.sort((a,b)=>b.score-a.score).map(link=>link.url))].slice(0, 6);
}

const INTERNAL_PAGE_SKIP = /(?:\.(?:avif|css|gif|ico|jpe?g|js|json|mp4|pdf|png|svg|webp|xml)(?:$|\?)|\b(?:account|accessibility|cart|careers?|checkout|cookie|legal|login|privacy|register|terms)\b)/i;

/**
 * Small restaurant sites are cheap enough to explore broadly. This is not a
 * relevance model: it only removes hard traps and returns ordinary same-site
 * HTML links. Large sites still use the priority links above.
 */
export function discoverBoundedInternalLinks(html:string,baseUrl:string):string[]{
  const $=cheerio.load(html),base=new URL(baseUrl),links:string[]=[];
  $("a[href]").each((_,element)=>{
    const safe=safePublicUrl($(element).attr("href"),baseUrl);if(!safe)return;
    const parsed=new URL(safe);if(parsed.origin!==base.origin||parsed.href===base.href)return;
    for(const key of [...parsed.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid|mc_cid|mc_eid)$/i.test(key))parsed.searchParams.delete(key);
    parsed.hash="";
    if(INTERNAL_PAGE_SKIP.test(`${parsed.pathname} ${$(element).text()}`))return;
    const normalized=parsed.href.replace(/\/$/,"");
    if(!links.includes(normalized))links.push(normalized);
  });
  return links.slice(0,40);
}

export function parseSitemapMenuLinks(xml: string, rootUrl: string, restaurantName?: string,restaurantAddress?:string,marketKeys:string[]=[]): string[] {
  const links:string[]=[];
  for(const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)){
    const value=match[1].replace(/&amp;/g,"&"),safe=safePublicUrl(value,rootUrl);
    if(!safe||!MENU_URL_HINT.test(new URL(safe).pathname)||!isTrustedCrawlUrl(safe,rootUrl,restaurantName,restaurantAddress,marketKeys))continue;
    links.push(safe);
  }
  return [...new Set(links)].slice(0,8);
}

async function discoverSitemapMenuLinks(rootUrl:string,restaurantName:string,restaurantAddress?:string,marketKeys:string[]=[]):Promise<string[]>{
  try{
    const root=new URL(rootUrl),sitemapUrl=`${root.origin}/sitemap.xml`;
    const response=await fetch(sitemapUrl,{headers:{accept:"application/xml,text/xml;q=0.9,*/*;q=0.5"},signal:AbortSignal.timeout(10_000)});
    if(!response.ok)return[];const xml=await response.text(),direct=parseSitemapMenuLinks(xml,rootUrl,restaurantName,restaurantAddress,marketKeys);
    if(direct.length)return direct;
    const childSitemaps=[...xml.matchAll(/<loc>\s*([^<]*sitemap[^<]*)<\/loc>/gi)].map(match=>safePublicUrl(match[1].replace(/&amp;/g,"&"),sitemapUrl)).filter(Boolean).slice(0,4) as string[];
    const found:string[]=[];
    for(const child of childSitemaps){try{const childResponse=await fetch(child,{headers:{accept:"application/xml,text/xml;q=0.9,*/*;q=0.5"},signal:AbortSignal.timeout(8_000)});if(childResponse.ok)found.push(...parseSitemapMenuLinks(await childResponse.text(),rootUrl,restaurantName,restaurantAddress,marketKeys));}catch{}}
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
      const item = { ...raw, name, imageUrl: raw.imageUrl ? canonicalizeWebsiteImageUrl(raw.imageUrl, url) : undefined };
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
  const menuContext = MENU_URL_HINT.test(new URL(url).pathname) || /<title[^>]*>[^<]*menu/i.test(html)
    || /(?:id|class)=["'][^"']*\bmenu\b[^"']*["']/i.test(html)
    || /<h[1-4][^>]*>\s*(?:our\s+)?menu\s*<\/h[1-4]>/i.test(html);
  add(parseSchemaOrgMenuItems(html), "schema_org", 0.95);
  const semantic=menuContext?parseSemanticMenuDom(html):[];
  if (menuContext) {
    add(parseVisibleMenuItems(html), "visible_menu", 0.8);
    add(semantic,"semantic_menu_dom",0.84);
    const loose=parseLooseMenuDom(html);
    add(loose,"loose_menu_dom",0.86);
    if(!semantic.length&&!loose.length)add(parseUnpricedMenuDom(html),"unpriced_visual_menu",0.74);
  }
  for (const platform of platforms) add(extractEmbeddedJsonMenuItems(html, platform), `platform_${platform}`, 0.93);
  const priorityLinks=discoverMenuContextLinks(html,url);
  const internalLinks=discoverBoundedInternalLinks(html,url);
  return {
    items,
    platforms,
    photos: assets.photoUrls.flatMap((value) => canonicalizeWebsiteImageUrl(value, url) ?? []),
    namedPhotos: extractNamedWebsitePhotos(html, url, method),
    pdfs: assets.pdfUrls.flatMap((value) => safePublicUrl(value, url) ?? []),
    // Put menu/gallery/food pages first so the bounded crawl cannot crowd them
    // out with lower-value same-site navigation.
    links: [...priorityLinks, ...assets.pageUrls.flatMap((value) => safePublicUrl(value, url) ?? [])],
    internalLinks,
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
    const item = { ...raw, imageUrl: raw.imageUrl ? canonicalizeWebsiteImageUrl(raw.imageUrl, url) : undefined };
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
  const maxPages = Math.min(12, Math.max(1, options.maxPages ?? 12));
  let pageBudget=Math.min(6,maxPages),smallSite=false;
  const queue = [target.url], queued = new Set(queue), visited = new Set<string>();
  const allItems: WebsiteItemEvidence[] = [], namedPhotos: NamedWebsitePhoto[] = [], photos = new Set<string>(), menuImages = new Set<string>(), pdfs = new Set<string>();
  const platforms = new Set<OrderingPlatform>(), methods = new Set<string>(), routeDecisions: string[] = [], pages: PageEvidence[] = [];
  let blocked = false, lastError: string | undefined;

  while (queue.length && visited.size < pageBudget) {
    const requestedUrl = queue.shift()!;
    if (visited.has(requestedUrl)) continue;
    visited.add(requestedUrl);
    let fetched = await directFetch(requestedUrl);
    methods.add("http");
    let finalUrl = fetched.finalUrl ?? requestedUrl;
    if (fetched.ok && !isTrustedCrawlUrl(finalUrl, target.url,target.restaurantName,target.restaurantAddress,target.marketKeys)) {
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
        if (!isTrustedCrawlUrl(alternativeUrl, target.url,target.restaurantName,target.restaurantAddress,target.marketKeys)) { lastError = "untrusted_cross_domain_redirect"; continue; }
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
          if (safe && isTrustedCrawlUrl(safe,target.url,target.restaurantName,target.restaurantAddress,target.marketKeys) && queued.size < 16 && !queued.has(safe)) { queued.add(safe); queue.push(safe); }
        }
        if (candidate.items.length > 0) break;
        if (options.deepDiscovery && method === "patchright" && route.length === 1) {
          route = ["crawl4ai"];
          routeDecisions.push(`${requestedUrl}:crawl4ai_discovery`);
          const discovery = await alternateFetch(requestedUrl, "crawl4ai");
          methods.add("crawl4ai");
          for (const link of discovery.links ?? []) {
            const safe = safePublicUrl(link, discovery.finalUrl ?? requestedUrl);
            if (safe && isTrustedCrawlUrl(safe,target.url,target.restaurantName,target.restaurantAddress,target.marketKeys) && queued.size < 16 && !queued.has(safe)) { queued.add(safe); queue.push(safe); }
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
    parsed.namedPhotos.forEach((photo) => namedPhotos.push(photo));
    parsed.photos.forEach((photo) => photos.add(photo));
    parsed.menuImages.forEach((photo) => menuImages.add(photo));
    parsed.pdfs.forEach((pdf) => pdfs.add(pdf));
    parsed.platforms.forEach((platform) => platforms.add(platform));
    for (const link of parsed.links) {
      if (queued.size >= 16) break;
      if (isTrustedCrawlUrl(link,target.url,target.restaurantName,target.restaurantAddress,target.marketKeys) && !queued.has(link)) { queued.add(link); queue.push(link); }
    }
    if(visited.size===1&&parsed.internalLinks.length<=18){smallSite=true;pageBudget=Math.min(maxPages,Math.max(1,parsed.internalLinks.length+1));}
    if(smallSite){
      for(const link of parsed.internalLinks){
        if(queued.size>=24)break;
        if(isTrustedCrawlUrl(link,target.url,target.restaurantName,target.restaurantAddress,target.marketKeys)&&!queued.has(link)){queued.add(link);queue.push(link);}
      }
    }
    // Many chain/location sites expose a conventional menu route but omit it
    // from the server-rendered navigation. Probe only a tiny same-origin set.
    if (visited.size === 1 && parsed.items.length === 0 && !parsed.links.some(link=>MENU_URL_HINT.test(new URL(link).pathname))) {
      const origin=new URL(target.url).origin;
      const sitemapLinks=await discoverSitemapMenuLinks(target.url,target.restaurantName,target.restaurantAddress,target.marketKeys);
      for(const candidate of [...sitemapLinks].reverse()){if(!queued.has(candidate)){queued.add(candidate);queue.unshift(candidate);}}
      for(const path of ["/menu","/menus","/food-menu"]){const candidate=`${origin}${path}`;if(queued.size<16&&!queued.has(candidate)){queued.add(candidate);queue.push(candidate);}}
    }
  }

  const items = attachNamedPhotosToMenuItems(mergeEvidence(allItems), namedPhotos);
  const linkedPhotos = [...new Set(items.flatMap((evidence) => evidence.item.imageUrl ? [evidence.item.imageUrl] : []))];
  const status = items.length || linkedPhotos.length || menuImages.size ? "completed" : blocked ? "blocked" : pages.length ? "empty" : "failed";
  return {
    status,
    items,
    namedPhotos: [...new Map(namedPhotos.map((photo) => [photo.url, photo])).values()].slice(0, 80),
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
