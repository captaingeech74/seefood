#!/usr/bin/env -S npx tsx
import { verifiedSupabaseSsl } from "./lib/verifiedSupabaseSsl.mjs";
/**
 * Give photo-empty live restaurants a small, trustworthy first visual set.
 * Preview is the default. Publication requires --publish and is reversible by
 * --rollback-run=<uuid>. No paid API is used: image screening uses macOS Vision.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { fingerprintPhoto, isImageContentType } from "../src/lib/photoFingerprint";
import {
  decideLocalFoodVision,
  hasRestaurantIdentityInUrl,
  normalizeEvidenceText,
  selectCoverageFirstCandidates,
  type VisionLabel,
} from "../src/lib/zeroPhotoCompletion";
import type { DataSource, DishPhoto } from "../src/lib/types";

const POLICY_VERSION = "zero-photo-v1-conservative-2026-09-28";
const STRONG_PAGE = /(?:^|[\/_-])(?:food|dishes|cuisine|menu|brunch|breakfast|lunch|dinner|eat|galler(?:y|ies)|photos?)(?:[\/_-]|$)/i;
const FOOD_WORD = /(?:^|\b)(?:bacon|beef|bowl|bread|breakfast|burger|burrito|cake|chicken|chile|curry|dessert|dumpling|egg|fries|kabob|kebab|lamb|lobster|musubi|noodles?|pasta|pizza|pork|ramen|rice|salad|salmon|sandwich|shrimp|soup|steak|sushi|taco|toast|tuna|waffle|wings?)(?:\b|$)/i;
const BAD_TEXT = /(?:^|\b)(?:about|apparel|available at|bar|bartender|banner|beer|bellini|beverage|bottles?|building|cartoon|cat|cocktails?|coffee|dog|drawing|drinks?|event|exterior|facebook|full|header|hoodie|illustration|instagram|interior|latte|logo|map|menu|monsters?|participating locations|people|promotion|reservation|seating|shirt|smoothie|social|staff|starting at|storefront|summer|team|tea|wine)(?:\b|$)/i;
const VENUE_SHELL = /(?:^|\b)(?:commons|mall|marketplace|shopping center)(?:\b|$)/i;
const ALLOWED_SOURCES = new Set<DataSource>([
  "schema_org", "menufy", "toast", "square", "clover", "chownow", "olo",
  "popmenu", "bentobox", "owner", "spothopper", "spoton", "slice",
  "flipdish", "lightspeed", "gloriafood", "menu_ocr",
]);

type Candidate = {
  entityId: string;
  restaurantId: string;
  restaurantName: string;
  websiteUrl: string;
  domain: string;
  pageUrl: string;
  assetUrl: string;
  contentHash: string;
  byteCount: number;
  label: string | null;
  sourceKey: string;
  dishLinked: boolean;
  menuItemId: number | null;
  menuItemName: string | null;
  namedCandidate: boolean;
  score: number;
};

type Evaluated = Candidate & {
  localPath?: string;
  width?: number;
  height?: number;
  perceptualHash?: string;
  labels?: VisionLabel[];
  decision: "food" | "reject" | "uncertain" | "failed";
  reason: string;
};

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function loadEnv() {
  const path = resolve(".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function safeSource(value: string): DataSource {
  return ALLOWED_SOURCES.has(value as DataSource) ? value as DataSource : "schema_org";
}

async function metrics(db: pg.Client) {
  return (await db.query(`
    with live as (
      select distinct e.id
      from restaurant_entities e join restaurants r on r.entity_id=e.id
      where e.status='active' and r.status='active'
    ), useful as (
      select distinct r.entity_id
      from restaurants r join photos p on p.restaurant_id=r.place_id
      where r.status='active' and p.active and p.is_orderable and not p.is_storefront
        and p.dedupe_reason is null and p.duplicate_of_photo_id is null
    )
    select (select count(*)::int from live) live_entities,
      (select count(*)::int from live join useful on useful.entity_id=live.id) entities_with_useful_photos,
      (select count(*)::int from live left join useful on useful.entity_id=live.id where useful.entity_id is null) empty_entities,
      (select count(*)::int from photos p join restaurants r on r.place_id=p.restaurant_id
        where r.status='active' and p.active and p.is_orderable and not p.is_storefront
          and p.dedupe_reason is null and p.duplicate_of_photo_id is null) useful_photos
  `)).rows[0];
}

async function loadCandidates(db: pg.Client, limit: number, market?: string): Promise<Candidate[]> {
  const rows = (await db.query(`
    with empty_restaurants as (
      select distinct on (e.id) e.id entity_id,e.name,r.place_id
      from restaurant_entities e join restaurants r on r.entity_id=e.id
      where e.status='active' and r.status='active'
        and ($2::text is null or exists(select 1 from acquisition_market_entities m where m.entity_id=e.id and m.market_key=$2 and m.active))
        and not exists (
          select 1 from photos p where p.restaurant_id=r.place_id and p.active
            and p.is_orderable and not p.is_storefront and p.dedupe_reason is null
            and p.duplicate_of_photo_id is null
        )
      order by e.id,r.place_id
    ), candidates as (
      select er.entity_id,er.place_id,er.name,w.url website_url,w.domain,
        coalesce(a.page_url,w.url) page_url,a.asset_url,
        a.metadata->>'contentSha256' content_sha256,
        (a.metadata->>'byteCount')::int byte_count,
        coalesce(a.metadata->>'matchedMenuName',a.metadata->>'namedFoodLabel') label,
        coalesce(a.source,'schema_org') source_key,
        a.metadata->>'namedMatchStatus'='matched' dish_linked,
        a.metadata->>'matchedMenuName' matched_menu_name,
        coalesce((a.metadata->>'namedPhotoCandidate')::boolean,false) named_candidate,
        row_number() over(partition by er.entity_id order by
          (a.metadata->>'namedMatchStatus'='matched') desc,
          coalesce((a.metadata->>'namedPhotoCandidate')::boolean,false) desc,
          (coalesce(a.page_url,w.url) ~* '/(menu|food|dishes|cuisine|breakfast|brunch|lunch|dinner|gallery|galleries|photos?)(/|$)') desc,
          (a.metadata->>'byteCount')::int desc nulls last,a.id) candidate_rank
      from empty_restaurants er
      join website_assets a on a.entity_id=er.entity_id and a.active and a.kind='image'
      join restaurant_websites w on w.id=a.website_id and w.active
      where a.metadata->>'verificationStatus'='byte_verified'
        and a.metadata->>'contentSha256' is not null
        and (a.metadata->>'byteCount')::int between 20000 and 15000000
        and not exists (
        select 1 from photos old where old.restaurant_id=er.place_id
          and old.content_hash=a.metadata->>'contentSha256' and old.dedupe_reason is not null
      )
    )
    select * from candidates where candidate_rank<=8
    order by dish_linked desc,named_candidate desc,byte_count desc limit $1
  `, [limit,market??null])).rows;

  const restaurantIds = [...new Set(rows.map((row) => row.place_id))];
  const menuRows = restaurantIds.length ? (await db.query(
    `select id,restaurant_id,name from menu_items where active and restaurant_id=any($1::text[])`,
    [restaurantIds],
  )).rows : [];
  const menuByRestaurant = new Map<string, Map<string, { id: number; name: string }>>();
  for (const menu of menuRows) {
    const index = menuByRestaurant.get(menu.restaurant_id) ?? new Map();
    const key = normalizeEvidenceText(menu.name).replace(/ /g, "");
    if (!index.has(key)) index.set(key, { id: Number(menu.id), name: menu.name });
    menuByRestaurant.set(menu.restaurant_id, index);
  }

  return rows.map((row) => {
    const menu = row.dish_linked
      ? menuByRestaurant.get(row.place_id)?.get(normalizeEvidenceText(row.matched_menu_name ?? "").replace(/ /g, ""))
      : undefined;
    const dishLinked = Boolean(menu);
    const namedCandidate = Boolean(row.named_candidate);
    return {
      entityId: row.entity_id,
      restaurantId: row.place_id,
      restaurantName: row.name,
      websiteUrl: row.website_url,
      domain: row.domain,
      pageUrl: row.page_url,
      assetUrl: row.asset_url,
      contentHash: row.content_sha256,
      byteCount: Number(row.byte_count),
      label: row.label,
      sourceKey: row.source_key,
      dishLinked,
      menuItemId: menu?.id ?? null,
      menuItemName: menu?.name ?? null,
      namedCandidate,
      score: dishLinked ? 100 : namedCandidate ? 70 : 40,
    };
  });
}

function prequalify(candidate: Candidate): string | null {
  if (VENUE_SHELL.test(candidate.restaurantName)) return "venue_shell_not_restaurant";
  if (!hasRestaurantIdentityInUrl(candidate.restaurantName, candidate.websiteUrl, candidate.pageUrl)) return "restaurant_identity_unproven";
  let path = "";
  try { path = decodeURIComponent(new URL(candidate.pageUrl).pathname); } catch { return "invalid_evidence_url"; }
  const label = normalizeEvidenceText(candidate.label ?? "");
  if (candidate.dishLinked) return null;
  if (!STRONG_PAGE.test(path) && !(candidate.namedCandidate && FOOD_WORD.test(label))) return "weak_page_context";
  if (label && (label.length > 110 || BAD_TEXT.test(label) || /\bcafe de olla\b/i.test(label))) return "weak_or_nonfood_label";
  if (candidate.namedCandidate && label.length < 4) return "weak_or_nonfood_label";
  if (!candidate.namedCandidate && !STRONG_PAGE.test(path)) return "generic_image_without_food_page";
  return null;
}

async function downloadAndVerify(candidate: Candidate, directory: string): Promise<Evaluated> {
  try {
    const response = await fetch(candidate.assetUrl, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !isImageContentType(response.headers.get("content-type"))) throw new Error(`http_${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 15_000_000) throw new Error("oversized");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 20_000 || bytes.length > 15_000_000) throw new Error("invalid_byte_count");
    const meta = await sharp(bytes, { failOn: "error" }).metadata();
    const width = meta.width ?? 0, height = meta.height ?? 0, ratio = height ? width / height : 0;
    if (width < 320 || height < 240 || ratio < 0.5 || ratio > 2.2) throw new Error("unusable_dimensions");
    const hashes = await fingerprintPhoto(bytes);
    if (hashes.contentHash !== candidate.contentHash) throw new Error("content_changed");
    const localPath = join(directory, `${candidate.contentHash}.img`);
    writeFileSync(localPath, bytes, { flag: "wx" });
    return { ...candidate, localPath, width, height, perceptualHash: hashes.perceptualHash, decision: "uncertain", reason: "awaiting_local_vision" };
  } catch (error) {
    return { ...candidate, decision: "failed", reason: String(error) };
  }
}

function classifyWithAppleVision(rows: Evaluated[], directory: string): Evaluated[] {
  const ready = rows.filter((row) => row.localPath);
  if (!ready.length) return rows;
  if (process.platform !== "darwin") throw new Error("The zero-photo publisher requires macOS Vision; no fail-open classifier is allowed.");
  const binary = join(directory, "apple-vision-classify");
  execFileSync("xcrun", ["swiftc", resolve("scripts/apple-vision-classify.swift"), "-o", binary], { stdio: "pipe" });
  const input = ready.map((row) => JSON.stringify({ id: row.contentHash, path: row.localPath })).join("\n") + "\n";
  const result = spawnSync(binary, [], { input, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60_000 });
  if (result.status !== 0) throw new Error(`Apple Vision classifier failed: ${result.stderr}`);
  const labelsByHash = new Map<string, VisionLabel[]>();
  for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
    const parsed = JSON.parse(line) as { id: string; labels: VisionLabel[]; error?: string };
    if (!parsed.error) labelsByHash.set(parsed.id, parsed.labels);
  }
  return rows.map((row) => {
    if (!row.localPath) return row;
    const labels = labelsByHash.get(row.contentHash);
    if (!labels) return { ...row, decision: "failed", reason: "local_vision_failed" };
    const decision = decideLocalFoodVision(labels);
    return { ...row, labels, decision, reason: decision === "food" ? "positive_local_food_evidence" : decision === "reject" ? "local_nonfood_or_explicit_signal" : "ambiguous_visual_content" };
  });
}

async function rollback(db: pg.Client, runId: string) {
  const run = (await db.query("select * from zero_photo_completion_runs where id=$1", [runId])).rows[0];
  if (!run) throw new Error(`Unknown run ${runId}`);
  if (run.status === "rolled_back") return console.log(JSON.stringify({ runId, status: "already_rolled_back" }));
  const actions = (await db.query("select * from zero_photo_completion_actions where run_id=$1 and decision='published' order by id desc", [runId])).rows;
  await db.query("begin");
  try {
    for (const action of actions) {
      if (action.previous_photo_state) {
        const previous = action.previous_photo_state;
        await db.query(`update photos set active=$2,is_orderable=$3,menu_item_id=$4,gemini_label=$5,dedupe_reason=$6,duplicate_of_photo_id=$7 where id=$1`,
          [action.photo_id, previous.active, previous.is_orderable, previous.menu_item_id, previous.gemini_label, previous.dedupe_reason, previous.duplicate_of_photo_id]);
      } else {
        await db.query(`update photos set active=false,is_orderable=false,dedupe_reason='zero_photo_completion_rollback',deduped_at=now() where id=$1`, [action.photo_id]);
      }
    }
    await db.query("update zero_photo_completion_runs set status='rolled_back',completed_at=now() where id=$1", [runId]);
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }
  console.log(JSON.stringify({ runId, status: "rolled_back", photosRestoredOrDisabled: actions.length }, null, 2));
}

async function main() {
  loadEnv();
  const publish = process.argv.includes("--publish");
  const rollbackRun = option("rollback-run");
  const candidateLimit = Math.min(20_000, Math.max(1, Number(option("candidate-limit") ?? "12000")));
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password), ssl: verifiedSupabaseSsl(), application_name: "seefood-zero-photo-completion" });
  await db.connect();
  try {
    if (rollbackRun) return await rollback(db, rollbackRun);
    const before = await metrics(db);
    const raw = await loadCandidates(db, candidateLimit, option("market"));
    const withheldBeforeDownload: Evaluated[] = [];
    const prequalified: Candidate[] = [];
    for (const candidate of raw) {
      const reason = prequalify(candidate);
      if (reason) withheldBeforeDownload.push({ ...candidate, decision: "reject", reason });
      else prequalified.push(candidate);
    }

    const runId = randomUUID();
    const temp = mkdtempSync(join(tmpdir(), "seefood-zero-photo-"));
    const output = resolve("logs", "zero-photo-completion", runId);
    mkdirSync(output, { recursive: true });
    try {
      let cursor = 0;
      const downloaded: Evaluated[] = [];
      await Promise.all(Array.from({ length: 12 }, async () => {
        while (cursor < prequalified.length) downloaded.push(await downloadAndVerify(prequalified[cursor++], temp));
      }));
      const evaluated = [...withheldBeforeDownload, ...classifyWithAppleVision(downloaded, temp)];
      const food = evaluated.filter((row) => row.decision === "food" && row.localPath) as Array<Evaluated & { localPath: string; width: number; height: number; perceptualHash: string }>;
      const selected = selectCoverageFirstCandidates(food);
      const selectedKeys = new Set(selected.map((row) => `${row.restaurantId}|${row.contentHash}`));
      const final = evaluated.map((row) => row.decision === "food" && !selectedKeys.has(`${row.restaurantId}|${row.contentHash}`)
        ? { ...row, decision: "uncertain" as const, reason: "coverage_cap_or_duplicate" }
        : row);
      const selectionDir = join(output, "selected"); mkdirSync(selectionDir, { recursive: true });
      for (const row of selected) copyFileSync(row.localPath, join(selectionDir, `${row.contentHash}.img`));
      const manifest = {
        runId, policyVersion: POLICY_VERSION, mode: publish ? "publish" : "preview", before,
        rawCandidates: raw.length, prequalified: prequalified.length, visuallyConfirmedFood: food.length,
        selectedPhotos: selected.length, selectedRestaurants: new Set(selected.map((row) => row.restaurantId)).size,
        withheld: final.length - selected.length,
        selected: selected.map((row) => ({ restaurant: row.restaurantName, restaurantId: row.restaurantId, dish: row.menuItemName, label: row.label, dishLinked: row.dishLinked, pageUrl: row.pageUrl, assetUrl: row.assetUrl, contentHash: row.contentHash, vision: row.labels?.slice(0, 6) })),
      };
      writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
      writeFileSync(join(output, "decisions.json"), JSON.stringify(final.map(({ localPath: _path, ...row }) => row), null, 2));
      if (!publish) return console.log(JSON.stringify({ ...manifest, note: "Preview only; no production rows changed." }, null, 2));

      await db.query(`insert into zero_photo_completion_runs(id,status,mode,policy_version,before_metrics) values($1,'running','publish',$2,$3)`, [runId, POLICY_VERSION, before]);
      const { persistSourcePhotos } = await import("../src/lib/db");
      let published = 0, failed = 0;
      for (const row of selected) {
        const previous = (await db.query(`select id,active,is_orderable,menu_item_id,gemini_label,dedupe_reason,duplicate_of_photo_id from photos where restaurant_id=$1 and (content_hash=$2 or origin_url=$3) order by active desc,id limit 1`, [row.restaurantId, row.contentHash, row.assetUrl])).rows[0] ?? null;
        try {
          const source = row.dishLinked ? safeSource(row.sourceKey) : "common_crawl";
          const photo: DishPhoto = {
            id: `zero-photo-${row.contentHash}`, url: row.assetUrl,
            dishName: row.dishLinked ? row.menuItemName : null, dishDescription: null,
            menuItemId: row.dishLinked ? row.menuItemId ?? undefined : undefined,
            isMenuMatch: row.dishLinked, source, attribution: "owner", tier: row.dishLinked ? 1 : 3,
            width: row.width, height: row.height, loveCount: 0, primaryVotes: 0,
            sourcePlatform: source, photoAuthorType: "management", trustLabel: "management_photo",
            photoQualityScore: row.dishLinked ? 76 : 60, isHeroCandidate: row.dishLinked,
            isStorefront: false, isMenuPhoto: false, contentHash: row.contentHash, perceptualHash: row.perceptualHash,
          };
          const snapshotId = await persistSourcePhotos(row.restaurantId, source, [photo]);
          if (!snapshotId) throw new Error("source_disabled_or_persistence_failed");
          const saved = (await db.query(`select id from photos where restaurant_id=$1 and (content_hash=$2 or origin_url=$3) and active and is_orderable and dedupe_reason is null order by id limit 1`, [row.restaurantId, row.contentHash, row.assetUrl])).rows[0];
          if (!saved) throw new Error("photo_not_activated");
          await db.query(`insert into zero_photo_completion_actions(run_id,entity_id,restaurant_id,candidate_url,content_hash,decision,reason,dish_linked,menu_item_id,photo_id,previous_photo_state,evidence) values($1,$2,$3,$4,$5,'published',$6,$7,$8,$9,$10,$11)`,
            [runId, row.entityId, row.restaurantId, row.assetUrl, row.contentHash, row.reason, row.dishLinked, row.menuItemId, saved.id, previous, { policyVersion: POLICY_VERSION, websiteUrl: row.websiteUrl, pageUrl: row.pageUrl, label: row.label, vision: row.labels, snapshotId }]);
          published++;
        } catch (error) {
          await db.query(`insert into zero_photo_completion_actions(run_id,entity_id,restaurant_id,candidate_url,content_hash,decision,reason,dish_linked,menu_item_id,previous_photo_state,evidence) values($1,$2,$3,$4,$5,'failed',$6,$7,$8,$9,$10)`,
            [runId, row.entityId, row.restaurantId, row.assetUrl, row.contentHash, String(error), row.dishLinked, row.menuItemId, previous, { policyVersion: POLICY_VERSION, vision: row.labels }]);
          failed++;
        }
      }
      const after = await metrics(db);
      const summary = { ...manifest, published, failed };
      await db.query(`update zero_photo_completion_runs set status=$2,after_metrics=$3,summary=$4,completed_at=now() where id=$1`, [runId, failed ? "failed" : "completed", after, summary]);
      console.log(JSON.stringify({ ...summary, after, rollback: `npm run acquisition:complete-zero-photo -- --rollback-run=${runId}` }, null, 2));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  } finally { await db.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
