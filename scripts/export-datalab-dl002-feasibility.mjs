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
  "data-lab/raw/baseline/DL-002-stopped-national-quota-2026-07-27"
);
const args = process.argv.slice(2);
const mirrorArg = args.indexOf("--mirror");
const pythonArg = args.indexOf("--duckdb-python");
const mirror = mirrorArg >= 0 ? path.resolve(args[mirrorArg + 1]) : null;
const duckdbPython =
  pythonArg >= 0 ? path.resolve(args[pythonArg + 1]) : "python3";
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

function loadEnv() {
  return readFile(path.join(ROOT, ".env.local"), "utf8").then((content) => {
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  });
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function scanText(text, secretValues) {
  const findings = [];
  for (const secret of secretValues) {
    if (text.includes(secret)) findings.push("loaded_environment_secret_value");
  }
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text)) {
    findings.push("email_address");
  }
  if (/\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/.test(text)) {
    findings.push("token_pattern");
  }
  if (/postgres(?:ql)?:\/\//i.test(text)) findings.push("connection_string");
  return [...new Set(findings)];
}

async function scanFiles(root, secretValues) {
  const results = [];
  for (const relative of await listFiles(root)) {
    const bytes = await readFile(path.join(root, relative));
    const text = bytes.toString("utf8");
    const findings = scanText(text, secretValues);
    results.push({
      path: relative,
      sha256: sha256(bytes),
      environmentSecretValueScan: {
        status: "completed",
        result: findings.includes("loaded_environment_secret_value")
          ? "failed"
          : "passed",
      },
      personalDataAndCredentialPatternScan: {
        status: "completed",
        result: findings.length ? "failed" : "passed",
        findings,
      },
    });
  }
  const failures = results.filter(
    (row) =>
      row.environmentSecretValueScan.result !== "passed" ||
      row.personalDataAndCredentialPatternScan.result !== "passed"
  );
  if (failures.length) {
    throw new Error(
      `Redaction scan failed: ${failures.map((row) => row.path).join(", ")}`
    );
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
  for (const relative of await listFiles(root)) {
    await chmod(path.join(root, relative), 0o400);
  }
  const directories = ["."];
  for (const relative of await listFiles(root)) {
    let current = path.dirname(relative);
    while (current !== ".") {
      directories.push(current);
      current = path.dirname(current);
    }
  }
  for (const directory of [...new Set(directories)].sort().reverse()) {
    await chmod(path.join(root, directory), 0o500);
  }
}

const QUERIES = {
  proof: "show transaction_read_only",
  isolation: "show transaction_isolation",
  wal: "select pg_current_wal_lsn()::text as wal_lsn",
  providers: `
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
  bounds: `
select
  count(*)::int as entity_count,
  min(lat) as min_lat,
  max(lat) as max_lat,
  min(lng) as min_lng,
  max(lng) as max_lng
from restaurant_entities
where status <> 'test_fixture'
`.trim(),
  formSignals: `
select
  count(*) filter (
    where exists (
      select 1 from unnest(categories) category
      where lower(category) like '%ghost%'
         or lower(category) like '%virtual%'
    )
    or lower(name) ~ '(ghost|virtual|cloud kitchen)'
  )::int as heuristic_ghost_or_virtual_signals,
  count(*) filter (
    where exists (
      select 1 from unnest(categories) category
      where lower(category) like '%food_truck%'
    )
    or lower(name) like '%food truck%'
  )::int as heuristic_food_truck_signals
from restaurant_entities
where status <> 'test_fixture'
`.trim(),
  function: `
select
  pg_get_functiondef(p.oid) as function_source
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'coverage_v2_metrics'
order by p.oid desc
limit 1
`.trim(),
};

async function main() {
  const exportStartedAtUtc = new Date().toISOString();
  if (!mirror) throw new Error("Pass --mirror /absolute/ignored/output/path");
  if (!args[pythonArg + 1] && pythonArg >= 0) {
    throw new Error("--duckdb-python requires a path");
  }
  if (await exists(OUTPUT)) throw new Error(`Refusing to overwrite ${OUTPUT}`);
  if (await exists(mirror)) throw new Error(`Refusing to overwrite ${mirror}`);

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
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  const tempParent = await mkdtemp(path.join(ROOT, ".dl002-stop-"));
  const staging = path.join(tempParent, "bundle");
  await mkdir(staging, { recursive: true });

  let transaction = null;
  try {
    await client.connect();
    await client.query(
      "begin transaction isolation level repeatable read read only"
    );
    const readOnly = (await client.query(QUERIES.proof)).rows[0];
    const isolation = (await client.query(QUERIES.isolation)).rows[0];
    const walBefore = (await client.query(QUERIES.wal)).rows[0].wal_lsn;
    const providers = (await client.query(QUERIES.providers)).rows;
    const bounds = (await client.query(QUERIES.bounds)).rows[0];
    const formSignals = (await client.query(QUERIES.formSignals)).rows[0];
    const functionSource = (await client.query(QUERIES.function)).rows[0]
      .function_source;
    const walAfter = (await client.query(QUERIES.wal)).rows[0].wal_lsn;
    await client.query("rollback");
    await client.end();
    if (readOnly.transaction_read_only !== "on") {
      throw new Error("Production transaction was not read-only");
    }
    transaction = {
      mode: "REPEATABLE READ READ ONLY",
      transactionReadOnly: readOnly.transaction_read_only,
      transactionIsolation: isolation.transaction_isolation,
      walBefore,
      walAfter,
      executedStatements: [
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        QUERIES.proof,
        QUERIES.isolation,
        QUERIES.wal,
        QUERIES.providers,
        QUERIES.bounds,
        QUERIES.formSignals,
        QUERIES.function,
        QUERIES.wal,
        "ROLLBACK",
      ],
    };

    const feasibilityScript = path.join(
      ROOT,
      "scripts/dl002-national-feasibility.py"
    );
    const { stdout } = await execFileAsync(duckdbPython, [feasibilityScript], {
      cwd: ROOT,
      timeout: 5 * 60 * 1000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const overture = JSON.parse(stdout);

    const repositoryCommit = (
      await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT })
    ).stdout.trim();
    const migrationFiles = (await readdir(path.join(ROOT, "db/migrations")))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const deficiency = {
      status: "stopped_before_full_bundle",
      reason:
        "The registered national holdout quotas require verified fields that the authorized candidate union cannot prove.",
      exactDeficientCells: [
        {
          axis: "businessForm",
          cell: "ghostKitchen",
          required: 12,
          verifiedAvailable: 0,
          evidence:
            "The Overture national snapshot has zero explicit ghost_kitchen category or taxonomy records. SeeFood has heuristic name/category signals, but the contract does not allow inferred or unknown records to satisfy verified quotas.",
        },
        {
          axis: "lifecycle",
          cell: "newWithin12Months",
          required: 12,
          verifiedAvailable: 0,
          evidence:
            "Overture feature version and source update time do not establish a restaurant opening date. SeeFood ingestion timestamps also do not prove an opening date.",
        },
        {
          axis: "webStrength",
          cell: "structured",
          required: 30,
          verifiedAvailable: 0,
          evidence:
            "An Overture website field proves a public locator exists, not that its content is a structured current restaurant site.",
        },
        {
          axis: "webStrength",
          cell: "weakPdfSocial",
          required: 30,
          verifiedAvailable: 0,
          evidence:
            "A social or website locator does not prove that no stronger first-party or ordering surface exists.",
        },
        {
          axis: "webStrength",
          cell: "none",
          required: 30,
          verifiedAvailable: 0,
          evidence:
            "Absence of a website field in one identity snapshot is not affirmative evidence that no website is discoverable.",
        },
      ],
      consequence:
        "The Guardian cannot produce an accepted 120-record holdout plus 24 alternates without relaxing quotas or inventing labels. The full DL-002 evidence export must not proceed under the current contract.",
      safeNextAction:
        "DataLab must version the national holdout contract around fields supported by authorized national evidence, or add an authorized source that proves the deficient fields. County permit integrations must remain optional local validation, not the national acquisition plan.",
    };

    await writeJson(path.join(staging, "STOP.json"), deficiency);
    await writeJson(path.join(staging, "national-source-feasibility.json"), {
      overture: {
        ...overture,
        query: undefined,
      },
      seeFoodReadOnlySummary: {
        providers,
        entityBounds: bounds,
        heuristicBusinessFormSignals: formSignals,
        warning:
          "Heuristic signals are reported only to show why they cannot satisfy verified holdout quotas.",
      },
    });
    await writeFile(
      path.join(staging, "overture-national-feasibility.sql"),
      `${overture.query};\n`,
      "utf8"
    );
    await writeFile(
      path.join(staging, "coverage-v2-production-function.sql"),
      functionSource,
      "utf8"
    );
    await writeFile(
      path.join(staging, "queries.sql"),
      [
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
        "SHOW transaction_read_only;",
        "SHOW transaction_isolation;",
        ...Object.values(QUERIES)
          .slice(2)
          .map((query) => `${query};`),
        `${QUERIES.wal};`,
        "ROLLBACK;",
        "",
      ].join("\n\n"),
      "utf8"
    );
    await writeFile(
      path.join(staging, "README.md"),
      `# DL-002 main-thread stop artifact

This is not an accepted DL-002 baseline bundle. The main SeeFood thread stopped
before exporting clear national candidates or gold evidence because the
registered national quotas cannot be satisfied with verified fields from the
currently authorized candidate union.

The aggregate Overture query is reproducible against release
\`${overture.overtureRelease}\`. Production evidence came from one direct
\`REPEATABLE READ READ ONLY\` transaction ending in \`ROLLBACK\`. No application
route, production write, paid call, image download, DataLab control-file edit,
or clear Guardian candidate record was used.

\`STOP.json\` records the exact deficient cells and the safe correction. This
artifact should be used to version the benchmark contract before the full
bundle is requested again.
`,
      "utf8"
    );
    await writeJson(path.join(staging, "snapshot.json"), {
      status: "stopped_before_full_bundle",
      startedAtUtc: exportStartedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      repositoryCommit,
      schemaMigrationVersion: migrationFiles.at(-1),
      databaseFingerprint: {
        hostSha256: sha256(parsedDatabase.hostname),
        databaseNameSha256: sha256(parsedDatabase.pathname.replace(/^\//, "")),
        roleNameSha256: sha256(decodeURIComponent(parsedDatabase.username)),
      },
      transaction,
      productionCoverageFunctionSha256: sha256(functionSource),
      sourceVersions: {
        overturePlaces: overture.overtureRelease,
        seeFoodProviderObservations: providers,
      },
      piiRemoved: true,
      secretsRemoved: true,
    });

    const payloadScan = await scanFiles(staging, secretValues);
    await writeJson(path.join(staging, "redaction-log.json"), {
      status: "completed_before_publication",
      result: "passed",
      perFileResults: payloadScan,
      controlFileProcedure:
        "The serialized redaction log and final manifest were scanned after creation; the manifest includes every other file and excludes itself by definition.",
    });
    await scanFiles(staging, secretValues);
    await createManifest(staging);
    await scanFiles(staging, secretValues);

    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await rename(staging, OUTPUT);
    await mkdir(path.dirname(mirror), { recursive: true });
    await cp(OUTPUT, mirror, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await makeReadOnly(OUTPUT);
    await makeReadOnly(mirror);
    await rm(tempParent, { recursive: true, force: true });
    console.log(
      JSON.stringify(
        {
          status: "stopped_before_full_bundle",
          output: OUTPUT,
          mirror,
          overtureRelease: overture.overtureRelease,
          overtureRestaurantRecords: overture.restaurant_hierarchy,
          deficientCells: deficiency.exactDeficientCells.map(
            ({ axis, cell, required, verifiedAvailable }) => ({
              axis,
              cell,
              required,
              verifiedAvailable,
            })
          ),
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await client.query("rollback");
      await client.end();
    } catch {}
    await rm(tempParent, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
