#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(
  ROOT,
  "data-lab/raw/baseline/DL-002/main-thread-stage1"
);
const args = process.argv.slice(2);

function argument(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
}

const mirror = argument("--mirror");
const boundaryPath = argument("--boundary");
const duckdbPython = argument("--duckdb-python", "python3");
const SECRET_ENV_NAMES = [
  "GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "VISION_API_KEY",
  "PLACES_API_KEY",
  "SCRAPFLY_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function loadEnv() {
  const content = await readFile(path.join(ROOT, ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

async function writeJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonLines(target, rows) {
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(target, `${content}${rows.length ? "\n" : ""}`, "utf8");
}

function boundaryPolygons(boundary) {
  if (boundary.features?.length !== 1) {
    throw new Error("Expected exactly one Temecula boundary feature");
  }
  const geometry = boundary.features[0].geometry;
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Unsupported boundary geometry: ${geometry.type}`);
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + ring.length - 1) % ring.length];
    if (
      y1 > y !== y2 > y &&
      x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function contains(point, polygons) {
  return polygons.some(
    (rings) =>
      pointInRing(point, rings[0]) &&
      !rings.slice(1).some((hole) => pointInRing(point, hole))
  );
}

function websiteHost(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function textFindings(text, secretValues) {
  const findings = [];
  if (
    secretValues.some(
      (secret) => secret.length >= 8 && text.includes(secret)
    )
  ) {
    findings.push("loaded_environment_secret_value");
  }
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text)) {
    findings.push("email_address");
  }
  if (/postgres(?:ql)?:\/\//i.test(text)) findings.push("connection_string");
  if (/\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/.test(text)) {
    findings.push("token_pattern");
  }
  return findings;
}

async function scanFiles(root, secretValues) {
  const results = [];
  const failures = [];
  for (const relative of await listFiles(root)) {
    const bytes = await readFile(path.join(root, relative));
    const binary = /\.(zip|shp|shx|dbf)$/i.test(relative);
    const findings = binary
      ? []
      : textFindings(bytes.toString("utf8"), secretValues);
    const result = {
      path: relative,
      sha256: sha256(bytes),
      environmentSecretValueScan: {
        status: binary ? "not_applicable_binary" : "completed",
        result: "passed",
      },
      piiAndCredentialPatternScan: {
        status: binary ? "not_applicable_binary" : "completed",
        result: findings.length ? "failed" : "passed",
        findings,
      },
    };
    results.push(result);
    if (findings.length) failures.push(relative);
  }
  if (failures.length) {
    throw new Error(`Redaction scan failed: ${failures.join(", ")}`);
  }
  return results;
}

async function createManifest(root) {
  const lines = [];
  for (const relative of await listFiles(root)) {
    if (relative === "SHA256SUMS") continue;
    const bytes = await readFile(path.join(root, relative));
    lines.push(`${sha256(bytes)}  ${relative}`);
  }
  await writeFile(path.join(root, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

async function makeReadOnly(root) {
  const directories = new Set(["."]);
  for (const relative of await listFiles(root)) {
    await chmod(path.join(root, relative), 0o400);
    let directory = path.dirname(relative);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.dirname(directory);
    }
  }
  for (const directory of [...directories].sort().reverse()) {
    await chmod(path.join(root, directory), 0o500);
  }
}

const QUERIES = {
  readOnly: "show transaction_read_only",
  isolation: "show transaction_isolation",
  wal: "select pg_current_wal_lsn()::text as wal_lsn",
  temeculaEntities: `
select
  e.id as entity_id,
  e.legacy_place_id,
  e.name,
  e.address,
  e.lat,
  e.lng,
  e.status,
  e.operating_status,
  e.website,
  e.categories,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'providerId', identity.provider_id,
        'name', identity.name,
        'address', identity.address,
        'lat', identity.lat,
        'lng', identity.lng,
        'websiteHost',
          regexp_replace(
            lower(split_part(regexp_replace(identity.website, '^https?://', '', 'i'), '/', 1)),
            '^www\\.',
            ''
          ),
        'active', identity.active,
        'lastSeenDate', identity.last_seen_at::date::text
      )
      order by identity.provider_id
    ) filter (where identity.provider_id is not null),
    '[]'::jsonb
  ) as google_identities
from restaurant_entities e
left join restaurant_identities identity
  on identity.entity_id = e.id
 and identity.provider = 'google'
where e.status <> 'test_fixture'
  and e.lat between $1 and $2
  and e.lng between $3 and $4
group by e.id
order by e.id
`.trim(),
  providerSummary: `
select
  provider,
  count(*)::int as identity_count,
  count(distinct entity_id)::int as entity_count,
  min(last_seen_at)::date::text as first_seen_date,
  max(last_seen_at)::date::text as last_seen_date
from restaurant_identities
group by provider
order by identity_count desc, provider
`.trim(),
  coverageFunction: `
select
  pg_get_functiondef(p.oid) as function_source
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'coverage_v2_metrics'
order by p.oid desc
limit 1
`.trim(),
  coverageResult: `
select public.coverage_v2_metrics(
  $1::double precision,
  $2::double precision,
  $3::double precision,
  $4::double precision
) as metrics
`.trim(),
};

const REQUIRED_MARGINS = {
  marketSize: {
    top20: 36,
    otherTop50: 30,
    msa51_387: 24,
    micropolitan: 18,
    noncore: 12,
  },
  businessForm: {
    chain: 30,
    independent: 48,
  },
  sourceStatus: { openOrderable: 108, closedMovedReplaced: 12 },
  censusDivision: {
    "New England": 10,
    "Middle Atlantic": 14,
    "East North Central": 14,
    "West North Central": 10,
    "South Atlantic": 18,
    "East South Central": 8,
    "West South Central": 14,
    Mountain: 14,
    Pacific: 18,
  },
};

function marginDeficiencies(counts) {
  const deficiencies = [];
  for (const [axis, cells] of Object.entries(REQUIRED_MARGINS)) {
    for (const [cell, required] of Object.entries(cells)) {
      const available = Number(counts[axis]?.[cell] ?? 0);
      if (available < required) {
        deficiencies.push({ axis, cell, required, available });
      }
    }
  }
  return deficiencies;
}

async function main() {
  if (!mirror || !boundaryPath) {
    throw new Error(
      "Pass --mirror /absolute/path and --boundary /absolute/temecula.geojson"
    );
  }
  const resolvedMirror = path.resolve(mirror);
  const resolvedBoundary = path.resolve(boundaryPath);
  if (await exists(OUTPUT)) throw new Error(`Refusing to overwrite ${OUTPUT}`);
  if (await exists(resolvedMirror)) {
    throw new Error(`Refusing to overwrite ${resolvedMirror}`);
  }
  await loadEnv();
  const secretValues = SECRET_ENV_NAMES.map((name) => process.env[name]).filter(
    (value) => typeof value === "string" && value.length >= 8
  );
  const databaseUrl = process.env.DATABASE_URL?.replace(
    "[YOUR-PASSWORD]",
    encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "")
  );
  if (!databaseUrl) throw new Error("DATABASE_URL is unavailable");
  const parsedDatabase = new URL(databaseUrl);
  const startedAtUtc = new Date().toISOString();
  const tempParent = await mkdtemp(path.join(ROOT, ".dl002-stage1-"));
  const staging = path.join(tempParent, "bundle");
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  let connected = false;

  try {
    const publicBuilder = path.join(
      ROOT,
      "scripts/build-dl002-public-frames.py"
    );
    const pythonCommand =
      path.isAbsolute(duckdbPython) || duckdbPython.includes(path.sep)
        ? path.resolve(duckdbPython)
        : duckdbPython;
    const publicRun = await execFileAsync(
      pythonCommand,
      [
        publicBuilder,
        "--output",
        staging,
        "--boundary",
        resolvedBoundary,
      ],
      {
        cwd: ROOT,
        timeout: 12 * 60 * 1000,
        maxBuffer: 5 * 1024 * 1024,
      }
    );
    const publicSummary = JSON.parse(
      await readFile(path.join(staging, "public-frame-summary.json"), "utf8")
    );
    const deficiencies = marginDeficiencies(
      publicSummary.national.counts
    );
    if (deficiencies.length) {
      throw new Error(
        `National candidate frame has deficient marginal cells: ${JSON.stringify(
          deficiencies
        )}`
      );
    }

    const boundaryBytes = await readFile(resolvedBoundary);
    const boundary = JSON.parse(boundaryBytes.toString("utf8"));
    const polygons = boundaryPolygons(boundary);
    const points = polygons.flatMap((rings) => rings.flat());
    const south = Math.min(...points.map((point) => point[1]));
    const north = Math.max(...points.map((point) => point[1]));
    const west = Math.min(...points.map((point) => point[0]));
    const east = Math.max(...points.map((point) => point[0]));

    await client.connect();
    connected = true;
    await client.query(
      "begin transaction isolation level repeatable read read only"
    );
    const readOnly = (await client.query(QUERIES.readOnly)).rows[0];
    const isolation = (await client.query(QUERIES.isolation)).rows[0];
    const walBefore = (await client.query(QUERIES.wal)).rows[0].wal_lsn;
    const candidateRows = (
      await client.query(QUERIES.temeculaEntities, [
        south,
        north,
        west,
        east,
      ])
    ).rows;
    const providerSummary = (await client.query(QUERIES.providerSummary)).rows;
    const functionSource = (await client.query(QUERIES.coverageFunction)).rows[0]
      .function_source;
    const coverageResult = (
      await client.query(QUERIES.coverageResult, [
        south,
        north,
        west,
        east,
      ])
    ).rows[0].metrics;
    const walAfter = (await client.query(QUERIES.wal)).rows[0].wal_lsn;
    await client.query("rollback");
    await client.end();
    connected = false;
    if (
      readOnly.transaction_read_only !== "on" ||
      isolation.transaction_isolation !== "repeatable read"
    ) {
      throw new Error("Production did not confirm the forced read-only mode");
    }

    const temeculaSeeFood = candidateRows
      .filter((row) => contains([row.lng, row.lat], polygons))
      .map((row) => {
        const google = row.google_identities;
        const stableExternalId =
          row.legacy_place_id ||
          google.find((identity) => identity.active)?.providerId ||
          google[0]?.providerId;
        return {
          sourceFamily: "seefood",
          stableExternalId: stableExternalId || null,
          publicName: row.name,
          addressLine: row.address,
          city: "Temecula",
          state: "CA",
          postalCode: null,
          latitude: row.lat,
          longitude: row.lng,
          sourceCategory: row.categories,
          sourceOperatingStatus: row.operating_status || row.status,
          sourceObservedAt:
            google
              .map((identity) => identity.lastSeenDate)
              .filter(Boolean)
              .sort()
              .at(-1) || null,
          websiteHost: websiteHost(row.website),
          brandName: null,
          sourceLicense: "SeeFood internal corpus",
          sourceAttribution: "SeeFood provider identity graph",
          internalEntityJoinHash: sha256(`entity:${row.entity_id}`),
          googleIdentities: google.map((identity) => ({
            ...identity,
            internalEntityJoinHash: sha256(`entity:${row.entity_id}`),
          })),
          selectionEligible: Boolean(stableExternalId),
        };
      })
      .sort((a, b) =>
        String(a.stableExternalId).localeCompare(String(b.stableExternalId))
      );
    await writeJsonLines(
      path.join(staging, "temecula-seefood.jsonl"),
      temeculaSeeFood
    );
    await writeFile(
      path.join(staging, "coverage-v2-production-function.sql"),
      functionSource,
      "utf8"
    );
    await writeJson(path.join(staging, "production-frame-proof.json"), {
      transaction: {
        mode: "REPEATABLE READ READ ONLY",
        transactionReadOnly: readOnly.transaction_read_only,
        transactionIsolation: isolation.transaction_isolation,
        walBefore,
        walAfter,
        statements: [
          "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
          QUERIES.readOnly,
          QUERIES.isolation,
          QUERIES.wal,
          QUERIES.temeculaEntities,
          QUERIES.providerSummary,
          QUERIES.coverageFunction,
          QUERIES.coverageResult,
          QUERIES.wal,
          "ROLLBACK",
        ],
      },
      providerSummary,
      rectangleCoverageV2Metrics: {
        warning:
          "The installed production function accepts a rectangle; DL-002 candidate inclusion uses the exact Census polygon.",
        bounds: { south, north, west, east },
        metrics: coverageResult,
      },
    });
    await writeFile(
      path.join(staging, "queries.sql"),
      [
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
        `${QUERIES.readOnly};`,
        `${QUERIES.isolation};`,
        `${QUERIES.wal};`,
        `${QUERIES.temeculaEntities};`,
        `${QUERIES.providerSummary};`,
        `${QUERIES.coverageFunction};`,
        `${QUERIES.coverageResult};`,
        `${QUERIES.wal};`,
        "ROLLBACK;",
        "",
      ].join("\n\n"),
      "utf8"
    );

    const gitCommit = (
      await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT })
    ).stdout.trim();
    const migrations = (await readdir(path.join(ROOT, "db/migrations")))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    await writeJson(path.join(staging, "snapshot.json"), {
      stage: 1,
      status: "candidate_frames_complete_guardian_selection_pending",
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      repositoryCommit: gitCommit,
      schemaMigrationVersion: migrations.at(-1),
      databaseFingerprint: {
        hostSha256: sha256(parsedDatabase.hostname),
        databaseNameSha256: sha256(
          parsedDatabase.pathname.replace(/^\//, "")
        ),
        roleNameSha256: sha256(
          decodeURIComponent(parsedDatabase.username)
        ),
      },
      productionCoverageFunctionSha256: sha256(functionSource),
      productionReadProof: {
        mode: "REPEATABLE READ READ ONLY",
        transactionReadOnly: readOnly.transaction_read_only,
        transactionIsolation: isolation.transaction_isolation,
        walBefore,
        walAfter,
        exactSqlFile: "queries.sql",
        detailedResultFile: "production-frame-proof.json",
      },
      payloadCounts: {
        temeculaSeeFood: temeculaSeeFood.length,
        temeculaOpenStreetMap:
          publicSummary.temecula.openstreetmap.rowCount,
        temeculaOverture: publicSummary.temecula.overture.rowCount,
        nationalGuardianCandidates:
          publicSummary.national.rowCount,
      },
      publicBuilderStdoutSha256: sha256(publicRun.stdout),
      piiRemoved: true,
      secretsRemoved: true,
      optionalFields: {
        websiteStrengthRequired: false,
        exactCuisineBalanceRequired: false,
        foodTruckOrNontraditionalSubtypeRequired: false,
        ghostKitchenClassificationRequired: false,
        openingDateOrRecencyRequired: false,
      },
      stage2Gate:
        "Guardian freezes 120 records plus 12 alternates, then supplies selected public-ID hashes for the bounded evidence export.",
    });
    await writeFile(
      path.join(staging, "README.md"),
      `# DL-002 read-only handoff — Stage 1

This bundle supplies the bounded Temecula provider inputs and the Guardian-only
national candidate frame. It does not claim a completed baseline. The DataLab
reconciles the Temecula inputs, and the Guardian privately freezes the national
120 plus 12 alternates before Stage 2 exports selected evidence.

The scalable national frame uses one Overture Places release plus standardized
US Census CBSA boundaries, population ranks, and divisions. Riverside County
permits remain a Temecula-only independent validation input already held by the
DataLab; no county-by-county national integration is required.

Website strength, exact cuisine balance, food-truck/nontraditional subtypes,
ghost-kitchen classification, and restaurant opening date/recency are optional
and intentionally absent as hard requirements.

Stage 1 proves that every individual hard-quota margin has enough candidates.
The Guardian must still solve and verify the combined quotas, brand cap, and
12-alternate requirement before freezing the cohort. If that joint selection
is infeasible, it must stop with the deficient intersections rather than
weakening or inventing evidence.

Production was read through one forced \`REPEATABLE READ READ ONLY\` transaction
ending in \`ROLLBACK\`. No application route, production write, paid call,
image download, deployment, or DataLab control-file edit occurred.
`,
      "utf8"
    );

    const payloadScan = await scanFiles(staging, secretValues);
    await writeJson(path.join(staging, "redaction-log.json"), {
      status: "completed_before_publication",
      result: "passed",
      perFileResults: payloadScan,
      controlFileProcedure:
        "The serialized log and final manifest were scanned after creation; SHA256SUMS includes every other file and excludes itself by definition.",
    });
    await scanFiles(staging, secretValues);
    await createManifest(staging);
    await scanFiles(staging, secretValues);
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await rename(staging, OUTPUT);
    await mkdir(path.dirname(resolvedMirror), { recursive: true });
    await cp(OUTPUT, resolvedMirror, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await makeReadOnly(OUTPUT);
    await makeReadOnly(resolvedMirror);
    await rm(tempParent, { recursive: true, force: true });
    console.log(
      JSON.stringify(
        {
          status: "candidate_frames_complete_guardian_selection_pending",
          output: OUTPUT,
          mirror: resolvedMirror,
          counts: {
            temeculaSeeFood: temeculaSeeFood.length,
            temeculaOpenStreetMap:
              publicSummary.temecula.openstreetmap.rowCount,
            temeculaOverture: publicSummary.temecula.overture.rowCount,
            nationalGuardianCandidates:
              publicSummary.national.rowCount,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    if (connected) {
      try {
        await client.query("rollback");
        await client.end();
      } catch {}
    }
    await rm(tempParent, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
