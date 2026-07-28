#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const INPUT = path.join(
  ROOT,
  "data-lab/raw/baseline/DL-002/main-thread-stage1/guardian/national-candidates.jsonl",
);
const OUT = path.join(ROOT, "data-lab/raw/holdout");
const VERSION = "guardian-mincost-flow-v1.0.0";
const NODE_VERSION = process.version;
const MIN_SAME_BRAND_KM = 80;

const MARKET_QUOTA = {
  top20: 36,
  otherTop50: 30,
  msa51_387: 24,
  micropolitan: 18,
  noncore: 12,
};
const DIVISION_QUOTA = {
  "New England": 10,
  "Middle Atlantic": 14,
  "East North Central": 14,
  "West North Central": 10,
  "South Atlantic": 18,
  "East South Central": 8,
  "West South Central": 14,
  Mountain: 14,
  Pacific: 18,
};
const STATUS_QUOTA = { openOrderable: 108, closedMovedReplaced: 12 };
const MARKETS = Object.keys(MARKET_QUOTA);
const DIVISIONS = Object.keys(DIVISION_QUOTA);

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function brandKey(row) {
  return row.businessForm === "chain"
    ? `chain:${row.normalizedBrandKey}`
    : `independent:${row.stablePublicId}`;
}
function normalizePublicName(value = "") {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const inputBytes = fs.readFileSync(INPUT);
const rawRows = inputBytes
  .toString("utf8")
  .trim()
  .split(/\n/)
  .map((line) => JSON.parse(line));

const normalizationLog = {
  rawRows: rawRows.length,
  stableIdDuplicateGroups: 0,
  stableIdDuplicateRowsRemoved: 0,
  conflictingMarketGroupsResolvedByCbsaEvidence: 0,
  duplicateGroupRowsRemoved: 0,
  chainRowsExcludedForMissingBrandKey: 0,
};

// Resolve repeated public IDs before ranking. A CBSA-backed metropolitan
// classification wins over a contradictory noncore copy; otherwise canonical
// serialized row order is deterministic and independent of the secret seed.
const byStableId = new Map();
for (const row of rawRows) {
  const group = byStableId.get(row.stablePublicId) || [];
  group.push(row);
  byStableId.set(row.stablePublicId, group);
}
const stableUnique = [];
for (const group of byStableId.values()) {
  if (group.length > 1) {
    normalizationLog.stableIdDuplicateGroups++;
    normalizationLog.stableIdDuplicateRowsRemoved += group.length - 1;
    if (
      new Set(group.map((row) => row.marketSize)).size > 1 &&
      group.some(
        (row) =>
          row.marketSize !== "noncore" &&
          row.fieldEvidence?.marketSize?.cbsaCode,
      )
    ) {
      normalizationLog.conflictingMarketGroupsResolvedByCbsaEvidence++;
    }
  }
  group.sort((a, b) => {
    const aPreferred =
      a.marketSize !== "noncore" && a.fieldEvidence?.marketSize?.cbsaCode
        ? 0
        : 1;
    const bPreferred =
      b.marketSize !== "noncore" && b.fieldEvidence?.marketSize?.cbsaCode
        ? 0
        : 1;
    return aPreferred - bPreferred || stableJson(a).localeCompare(stableJson(b));
  });
  stableUnique.push(group[0]);
}

// Collapse declared duplicate locations by a public-ID-only canonical rule.
const byDuplicateGroup = new Map();
for (const row of stableUnique) {
  const group = byDuplicateGroup.get(row.duplicateGroup) || [];
  group.push(row);
  byDuplicateGroup.set(row.duplicateGroup, group);
}
const canonicalRows = [];
for (const group of byDuplicateGroup.values()) {
  group.sort((a, b) => a.stablePublicId.localeCompare(b.stablePublicId));
  canonicalRows.push(group[0]);
  normalizationLog.duplicateGroupRowsRemoved += group.length - 1;
}

const eligibleRows = canonicalRows.filter((row) => {
  const openEligible =
    row.eligibility === true && row.sourceStatus === "openOrderable";
  const statusSentinel =
    row.sourceStatus === "closedMovedReplaced" &&
    row.exclusionReason === "status_sentinel";
  if (
    !openEligible &&
    !statusSentinel
  )
    return false;
  if (
    row.isTemecula ||
    row.isLegacyBenchmark ||
    row.isDevelopment ||
    row.isTestFixture
  )
    return false;
  if (row.businessForm === "chain" && !row.normalizedBrandKey) {
    normalizationLog.chainRowsExcludedForMissingBrandKey++;
    return false;
  }
  return (
    MARKETS.includes(row.marketSize) &&
    DIVISIONS.includes(row.censusDivision) &&
    ["chain", "independent"].includes(row.businessForm) &&
    ["openOrderable", "closedMovedReplaced"].includes(row.sourceStatus)
  );
});

fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
const seedPath = path.join(OUT, "national-v1.seed");
const seed = fs.existsSync(seedPath)
  ? fs.readFileSync(seedPath)
  : crypto.randomBytes(32);
if (seed.length !== 32) throw new Error("Guardian seed must be exactly 32 bytes");
const seedCommitment = sha256(
  Buffer.concat([
    Buffer.from("SeeFood-DL002-national-v1-seed\0", "utf8"),
    seed,
  ]),
);
if (!fs.existsSync(seedPath)) fs.writeFileSync(seedPath, seed, { mode: 0o600 });

for (const row of eligibleRows) {
  row.selectionDigest = sha256(
    Buffer.concat([seed, Buffer.from(row.stablePublicId, "utf8")]),
  );
}
eligibleRows.sort(
  (a, b) =>
    a.selectionDigest.localeCompare(b.selectionDigest) ||
    a.stablePublicId.localeCompare(b.stablePublicId),
);
eligibleRows.forEach((row, index) => {
  row.rankOrdinal = index + 1;
});

class MinCostFlow {
  constructor(size) {
    this.graph = Array.from({ length: size }, () => []);
  }
  addEdge(from, to, cap, cost, meta = null) {
    const forward = { to, rev: this.graph[to].length, cap, cost, meta, originalCap: cap };
    const reverse = { to: from, rev: this.graph[from].length, cap: 0, cost: -cost, meta: null, originalCap: 0 };
    this.graph[from].push(forward);
    this.graph[to].push(reverse);
    return forward;
  }
  solve(source, sink, targetFlow) {
    let flow = 0;
    let cost = 0;
    const n = this.graph.length;
    const potential = Array(n).fill(0);
    while (flow < targetFlow) {
      const dist = Array(n).fill(Infinity);
      const prevNode = Array(n).fill(-1);
      const prevEdge = Array(n).fill(-1);
      const heap = [];
      const push = (item) => {
        heap.push(item);
        let index = heap.length - 1;
        while (index > 0) {
          const parent = Math.floor((index - 1) / 2);
          if (
            heap[parent][0] < item[0] ||
            (heap[parent][0] === item[0] && heap[parent][1] <= item[1])
          )
            break;
          heap[index] = heap[parent];
          index = parent;
        }
        heap[index] = item;
      };
      const pop = () => {
        const first = heap[0];
        const last = heap.pop();
        if (heap.length && last) {
          let index = 0;
          while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            if (left >= heap.length) break;
            let child = left;
            if (
              right < heap.length &&
              (heap[right][0] < heap[left][0] ||
                (heap[right][0] === heap[left][0] &&
                  heap[right][1] < heap[left][1]))
            )
              child = right;
            if (
              heap[child][0] > last[0] ||
              (heap[child][0] === last[0] && heap[child][1] >= last[1])
            )
              break;
            heap[index] = heap[child];
            index = child;
          }
          heap[index] = last;
        }
        return first;
      };
      dist[source] = 0;
      push([0, source]);
      while (heap.length) {
        const [currentDistance, node] = pop();
        if (currentDistance !== dist[node]) continue;
        for (let i = 0; i < this.graph[node].length; i++) {
          const edge = this.graph[node][i];
          if (edge.cap <= 0) continue;
          const reducedCost =
            edge.cost + potential[node] - potential[edge.to];
          const next = dist[node] + reducedCost;
          if (next < dist[edge.to]) {
            dist[edge.to] = next;
            prevNode[edge.to] = node;
            prevEdge[edge.to] = i;
            push([next, edge.to]);
          }
        }
      }
      if (!Number.isFinite(dist[sink])) break;
      for (let node = 0; node < n; node++) {
        if (Number.isFinite(dist[node])) potential[node] += dist[node];
      }
      let add = targetFlow - flow;
      for (let node = sink; node !== source; node = prevNode[node]) {
        if (node < 0 || prevNode[node] < 0) {
          add = 0;
          break;
        }
        add = Math.min(add, this.graph[prevNode[node]][prevEdge[node]].cap);
      }
      if (!add) break;
      for (let node = sink; node !== source; node = prevNode[node]) {
        const edge = this.graph[prevNode[node]][prevEdge[node]];
        edge.cap -= add;
        this.graph[node][edge.rev].cap += add;
      }
      flow += add;
      cost += add * potential[sink];
    }
    return { flow, cost };
  }
}

function flowSelect(rows, marketCaps, divisionCaps, targetFlow) {
  const source = 0;
  const marketStart = 1;
  const candidateStart = marketStart + MARKETS.length;
  const divisionStart = candidateStart + rows.length;
  const sink = divisionStart + DIVISIONS.length;
  const mcf = new MinCostFlow(sink + 1);
  for (let i = 0; i < MARKETS.length; i++) {
    mcf.addEdge(source, marketStart + i, marketCaps[MARKETS[i]] || 0, 0);
  }
  const candidateEdges = [];
  rows.forEach((row, index) => {
    const marketNode = marketStart + MARKETS.indexOf(row.marketSize);
    const candidateNode = candidateStart + index;
    const divisionNode =
      divisionStart + DIVISIONS.indexOf(row.censusDivision);
    const edge = mcf.addEdge(
      marketNode,
      candidateNode,
      1,
      row.rankOrdinal,
      row.stablePublicId,
    );
    candidateEdges.push({ edge, row });
    mcf.addEdge(candidateNode, divisionNode, 1, 0);
  });
  for (let i = 0; i < DIVISIONS.length; i++) {
    mcf.addEdge(
      divisionStart + i,
      sink,
      divisionCaps[DIVISIONS[i]] || 0,
      0,
    );
  }
  const result = mcf.solve(source, sink, targetFlow);
  return {
    ...result,
    selected: candidateEdges
      .filter(({ edge }) => edge.originalCap === 1 && edge.cap === 0)
      .map(({ row }) => row),
  };
}

function counts(rows, field, values) {
  return Object.fromEntries(
    values.map((value) => [
      value,
      rows.filter((row) => row[field] === value).length,
    ]),
  );
}
function validateSelection(selected) {
  const market = counts(selected, "marketSize", MARKETS);
  const division = counts(selected, "censusDivision", DIVISIONS);
  const status = counts(selected, "sourceStatus", Object.keys(STATUS_QUOTA));
  const chain = selected.filter((row) => row.businessForm === "chain").length;
  const independent = selected.filter(
    (row) => row.businessForm === "independent",
  ).length;
  const brands = new Map();
  for (const row of selected) {
    const key = brandKey(row);
    const group = brands.get(key) || [];
    group.push(row);
    brands.set(key, group);
  }
  const brandOverCap = [...brands.values()].filter((group) => group.length > 2);
  const tooClose = [...brands.values()].filter(
    (group) =>
      group.length === 2 &&
      group[0].businessForm === "chain" &&
      haversineKm(group[0], group[1]) < MIN_SAME_BRAND_KM,
  );
  return {
    valid:
      selected.length === 120 &&
      MARKETS.every((key) => market[key] === MARKET_QUOTA[key]) &&
      DIVISIONS.every((key) => division[key] === DIVISION_QUOTA[key]) &&
      Object.keys(STATUS_QUOTA).every(
        (key) => status[key] === STATUS_QUOTA[key],
      ) &&
      chain >= 30 &&
      independent >= 48 &&
      brandOverCap.length === 0 &&
      tooClose.length === 0,
    market,
    division,
    status,
    chain,
    independent,
    brandOverCap,
    tooClose,
  };
}

let bannedIds = new Set();
let selected = null;
let flowObjective = null;
let solveIterations = 0;
for (; solveIterations < 50; solveIterations++) {
  const allowed = eligibleRows.filter((row) => !bannedIds.has(row.stablePublicId));
  const closed = flowSelect(
    allowed.filter((row) => row.sourceStatus === "closedMovedReplaced"),
    MARKET_QUOTA,
    DIVISION_QUOTA,
    STATUS_QUOTA.closedMovedReplaced,
  );
  if (closed.flow !== STATUS_QUOTA.closedMovedReplaced) {
    throw new Error("Unable to select 12 closed/moved/replaced sentinels");
  }
  const closedMarket = counts(closed.selected, "marketSize", MARKETS);
  const closedDivision = counts(closed.selected, "censusDivision", DIVISIONS);
  const openMarket = Object.fromEntries(
    MARKETS.map((key) => [key, MARKET_QUOTA[key] - closedMarket[key]]),
  );
  const openDivision = Object.fromEntries(
    DIVISIONS.map((key) => [key, DIVISION_QUOTA[key] - closedDivision[key]]),
  );
  const open = flowSelect(
    allowed.filter((row) => row.sourceStatus === "openOrderable"),
    openMarket,
    openDivision,
    STATUS_QUOTA.openOrderable,
  );
  if (open.flow !== STATUS_QUOTA.openOrderable) {
    // Ban the highest-ranked closed selection and deterministically try the
    // next status-sentinel allocation.
    const worst = [...closed.selected].sort(
      (a, b) => b.rankOrdinal - a.rankOrdinal,
    )[0];
    bannedIds.add(worst.stablePublicId);
    continue;
  }
  const proposed = [...closed.selected, ...open.selected];
  const check = validateSelection(proposed);
  if (check.chain < 30 || check.independent < 48) {
    throw new Error(
      `Business-form quota failure: chain=${check.chain}, independent=${check.independent}`,
    );
  }
  if (!check.brandOverCap.length && !check.tooClose.length) {
    selected = proposed;
    flowObjective = closed.cost + open.cost;
    break;
  }
  for (const group of [...check.brandOverCap, ...check.tooClose]) {
    const ordered = [...group].sort(
      (a, b) =>
        a.rankOrdinal - b.rankOrdinal ||
        a.stablePublicId.localeCompare(b.stablePublicId),
    );
    const keep = [ordered[0]];
    if (
      ordered[1] &&
      haversineKm(ordered[0], ordered[1]) >= MIN_SAME_BRAND_KM
    ) {
      keep.push(ordered[1]);
    }
    const keepIds = new Set(keep.map((row) => row.stablePublicId));
    for (const row of eligibleRows) {
      if (brandKey(row) === brandKey(ordered[0]) && !keepIds.has(row.stablePublicId)) {
        bannedIds.add(row.stablePublicId);
      }
    }
  }
}
if (!selected) throw new Error("No valid selection after deterministic repair");

const selectionCheck = validateSelection(selected);
if (!selectionCheck.valid) {
  throw new Error(`Selection validation failed: ${stableJson(selectionCheck)}`);
}

// Optional descriptive repair: do not change any hard quota, but when the
// frame supports it, reduce a known cuisine above 20% by the lowest-rank-cost
// exact-cell/business substitution.
let cuisineRepairSwaps = 0;
while (true) {
  const knownCounts = new Map();
  for (const row of selected) {
    if (row.cuisineGroup === "unknown") continue;
    knownCounts.set(
      row.cuisineGroup,
      (knownCounts.get(row.cuisineGroup) || 0) + 1,
    );
  }
  const over = [...knownCounts.entries()]
    .filter(([, count]) => count > 24)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (!over) break;
  const currentIds = new Set(selected.map((row) => row.stablePublicId));
  const options = [];
  for (const primary of selected) {
    if (primary.cuisineGroup !== over[0]) continue;
    for (const alternate of eligibleRows) {
      if (currentIds.has(alternate.stablePublicId)) continue;
      if (
        alternate.cuisineGroup === "unknown" ||
        alternate.cuisineGroup === over[0] ||
        (knownCounts.get(alternate.cuisineGroup) || 0) >= 24 ||
        alternate.marketSize !== primary.marketSize ||
        alternate.censusDivision !== primary.censusDivision ||
        alternate.sourceStatus !== primary.sourceStatus ||
        alternate.businessForm !== primary.businessForm
      )
        continue;
      const replacement = selected.map((row) =>
        row.stablePublicId === primary.stablePublicId ? alternate : row,
      );
      if (!validateSelection(replacement).valid) continue;
      options.push({
        primary,
        alternate,
        delta: alternate.rankOrdinal - primary.rankOrdinal,
      });
    }
  }
  options.sort(
    (a, b) =>
      a.delta - b.delta ||
      a.alternate.rankOrdinal - b.alternate.rankOrdinal ||
      a.alternate.stablePublicId.localeCompare(b.alternate.stablePublicId),
  );
  if (!options.length) break;
  const chosen = options[0];
  selected = selected.map((row) =>
    row.stablePublicId === chosen.primary.stablePublicId
      ? chosen.alternate
      : row,
  );
  cuisineRepairSwaps++;
}

const postRepairSelectionCheck = validateSelection(selected);
if (!postRepairSelectionCheck.valid) {
  throw new Error("Optional cuisine repair changed a hard constraint");
}

const selectedIds = new Set(selected.map((row) => row.stablePublicId));
const selectedBrandCounts = new Map();
for (const row of selected) {
  const key = brandKey(row);
  selectedBrandCounts.set(key, (selectedBrandCounts.get(key) || 0) + 1);
}

const alternateOptions = [];
for (const primary of selected) {
  for (const alternate of eligibleRows) {
    if (selectedIds.has(alternate.stablePublicId)) continue;
    if (
      alternate.marketSize !== primary.marketSize ||
      alternate.censusDivision !== primary.censusDivision ||
      alternate.sourceStatus !== primary.sourceStatus ||
      alternate.businessForm !== primary.businessForm
    )
      continue;
    const primaryBrand = brandKey(primary);
    const alternateBrand = brandKey(alternate);
    const after =
      (selectedBrandCounts.get(alternateBrand) || 0) -
      (primaryBrand === alternateBrand ? 1 : 0) +
      1;
    if (after > 2) continue;
    if (alternate.businessForm === "chain") {
      const remainingSameBrand = selected.filter(
        (row) =>
          row.stablePublicId !== primary.stablePublicId &&
          brandKey(row) === alternateBrand,
      );
      if (
        remainingSameBrand.some(
          (row) => haversineKm(row, alternate) < MIN_SAME_BRAND_KM,
        )
      )
        continue;
    }
    alternateOptions.push({ primary, alternate });
  }
}
alternateOptions.sort(
  (a, b) =>
    a.alternate.rankOrdinal - b.alternate.rankOrdinal ||
    a.alternate.stablePublicId.localeCompare(b.alternate.stablePublicId) ||
    a.primary.rankOrdinal - b.primary.rankOrdinal,
);
const alternates = [];
const alternateIds = new Set();
const assignedPrimaryIds = new Set();
for (const option of alternateOptions) {
  if (alternateIds.has(option.alternate.stablePublicId)) continue;
  if (assignedPrimaryIds.has(option.primary.stablePublicId)) continue;
  alternates.push(option);
  alternateIds.add(option.alternate.stablePublicId);
  assignedPrimaryIds.add(option.primary.stablePublicId);
  if (alternates.length === 12) break;
}
if (alternates.length !== 12) {
  throw new Error(`Only ${alternates.length} direct-replacement alternates`);
}
for (const { primary, alternate } of alternates) {
  const replacement = selected.map((row) =>
    row.stablePublicId === primary.stablePublicId ? alternate : row,
  );
  const check = validateSelection(replacement);
  if (!check.valid) throw new Error("Alternate substitution failed validation");
}

const cuisineCounts = counts(
  selected,
  "cuisineGroup",
  [...new Set(selected.map((row) => row.cuisineGroup))].sort(),
);
const knownCuisineCounts = Object.entries(cuisineCounts).filter(
  ([key]) => key !== "unknown",
);
const cuisineSummary = {
  representedKnownGroups: knownCuisineCounts.length,
  maxKnownGroupCount: Math.max(0, ...knownCuisineCounts.map(([, count]) => count)),
  maxKnownGroupPercentage:
    Math.max(0, ...knownCuisineCounts.map(([, count]) => count)) / 120,
  counts: cuisineCounts,
};

const manifest = {
  schemaVersion: "national-holdout-v1",
  createdAtUtc: new Date().toISOString(),
  candidateFrameSha256: sha256(inputBytes),
  normalization: normalizationLog,
  seedCommitment,
  selector: {
    method: VERSION,
    runtime: NODE_VERSION,
    implementationSha256: sha256(fs.readFileSync(__filename)),
    rank: "SHA-256(secret_seed_bytes || UTF8(stablePublicId)); unsigned hex order; stablePublicId tie-break",
    objective: "two-phase minimum-cost flow over 1-based digest ordinals, status sentinels then open residual; deterministic brand repair",
    minSameBrandDistanceKm: MIN_SAME_BRAND_KM,
    solveIterations: solveIterations + 1,
    initialFlowObjectiveOrdinalSum: flowObjective,
    finalOrdinalSum: selected.reduce((sum, row) => sum + row.rankOrdinal, 0),
    optionalCuisineRepairSwaps: cuisineRepairSwaps,
  },
  quotas: {
    marketSize: postRepairSelectionCheck.market,
    businessForm: {
      chain: postRepairSelectionCheck.chain,
      independent: postRepairSelectionCheck.independent,
    },
    sourceStatus: postRepairSelectionCheck.status,
    censusDivision: postRepairSelectionCheck.division,
  },
  descriptive: {
    cuisine: cuisineSummary,
  },
  records: selected
    .sort(
      (a, b) =>
        a.rankOrdinal - b.rankOrdinal ||
        a.stablePublicId.localeCompare(b.stablePublicId),
    )
    .map((row) => ({
      stablePublicId: row.stablePublicId,
      stablePublicIdSha256: sha256(row.stablePublicId),
      selectionDigest: row.selectionDigest,
      rankOrdinal: row.rankOrdinal,
      publicName: row.publicName,
      latitude: row.latitude,
      longitude: row.longitude,
      coarseAddress: row.coarseAddress,
      marketSize: row.marketSize,
      businessForm: row.businessForm,
      businessSubtype: row.businessSubtype,
      sourceStatus: row.sourceStatus,
      censusDivision: row.censusDivision,
      normalizedBrandKey: row.normalizedBrandKey,
      cuisineGroup: row.cuisineGroup,
      webStrength: row.webStrength,
      sourceFamily: row.sourceFamily,
      sourceVersion: row.sourceVersion,
      sourceObservedAt: row.sourceObservedAt,
      duplicateGroup: row.duplicateGroup,
      fieldEvidence: row.fieldEvidence,
    })),
};
const alternateManifest = {
  schemaVersion: "national-holdout-alternates-v1",
  createdAtUtc: manifest.createdAtUtc,
  candidateFrameSha256: manifest.candidateFrameSha256,
  seedCommitment,
  count: alternates.length,
  alternates: alternates.map(({ primary, alternate }, index) => ({
    priority: index + 1,
    replacesStablePublicId: primary.stablePublicId,
    replacesStablePublicIdSha256: sha256(primary.stablePublicId),
    stablePublicId: alternate.stablePublicId,
    stablePublicIdSha256: sha256(alternate.stablePublicId),
    selectionDigest: alternate.selectionDigest,
    rankOrdinal: alternate.rankOrdinal,
    publicName: alternate.publicName,
    latitude: alternate.latitude,
    longitude: alternate.longitude,
    coarseAddress: alternate.coarseAddress,
    marketSize: alternate.marketSize,
    businessForm: alternate.businessForm,
    sourceStatus: alternate.sourceStatus,
    censusDivision: alternate.censusDivision,
    normalizedBrandKey: alternate.normalizedBrandKey,
    cuisineGroup: alternate.cuisineGroup,
    webStrength: alternate.webStrength,
    sourceFamily: alternate.sourceFamily,
    sourceVersion: alternate.sourceVersion,
    sourceObservedAt: alternate.sourceObservedAt,
    duplicateGroup: alternate.duplicateGroup,
    fieldEvidence: alternate.fieldEvidence,
  })),
};

const manifestPath = path.join(OUT, "national-v1.json");
const alternatesPath = path.join(OUT, "national-v1-alternates.json");
writeJson(manifestPath, manifest);
writeJson(alternatesPath, alternateManifest);

const selectedHashes = {
  schemaVersion: "national-stage2-selection-hashes-v1",
  candidateFrameSha256: manifest.candidateFrameSha256,
  seedCommitment,
  selectedStablePublicIdSha256: manifest.records
    .map((row) => row.stablePublicIdSha256)
    .sort(),
  alternateStablePublicIdSha256: alternateManifest.alternates
    .map((row) => row.stablePublicIdSha256)
    .sort(),
};
writeJson(path.join(OUT, "national-v1-stage2-hashes.json"), selectedHashes);

const exclusionLog = {
  schemaVersion: "national-holdout-exclusions-v1",
  candidateFrameSha256: manifest.candidateFrameSha256,
  normalization: normalizationLog,
  normalizedEligibleRows: eligibleRows.length,
  guardianRuleExclusions: {
    sameBrandMinimumDistanceKm: MIN_SAME_BRAND_KM,
    deterministicRepairBannedRows: bannedIds.size,
  },
};
writeJson(path.join(OUT, "national-v1-exclusion-log.json"), exclusionLog);

const reviewLog = {
  schemaVersion: "national-holdout-review-v1",
  candidateFrameSha256: manifest.candidateFrameSha256,
  hardFieldEvidence: {
    marketSize: "verified Census CBSA spatial join/population rank",
    censusDivision: "verified public state-to-division map",
    sourceStatus: "verified Overture operating_status",
    businessForm:
      "chain verified by Overture brand evidence; independent assignments remain source-evidenced inferred",
  },
  inferredBusinessAssignmentsSelected: selected.filter(
    (row) => row.fieldEvidence?.businessForm?.confidence === "inferred",
  ).length,
  inferredBusinessReview: (() => {
    const nameFrequency = new Map();
    for (const row of rawRows) {
      const key = normalizePublicName(row.publicName);
      nameFrequency.set(key, (nameFrequency.get(key) || 0) + 1);
    }
    const inferred = selected.filter(
      (row) => row.fieldEvidence?.businessForm?.confidence === "inferred",
    );
    return {
      method:
        "Private normalized-name frequency review against the full supplied frame, plus Overture missing-brand evidence; no clear IDs emitted",
      uniqueName: inferred.filter(
        (row) => nameFrequency.get(normalizePublicName(row.publicName)) === 1,
      ).length,
      nameSeenTwice: inferred.filter(
        (row) => nameFrequency.get(normalizePublicName(row.publicName)) === 2,
      ).length,
      nameSeenThreeToFiveTimes: inferred.filter((row) => {
        const count = nameFrequency.get(normalizePublicName(row.publicName));
        return count >= 3 && count <= 5;
      }).length,
      nameSeenMoreThanFiveTimes: inferred.filter(
        (row) => nameFrequency.get(normalizePublicName(row.publicName)) > 5,
      ).length,
      selectedInferredRowsWithBrandKey: inferred.filter(
        (row) => row.normalizedBrandKey,
      ).length,
      result:
        "accepted_as_source_evidenced_inferred_for_stage1; no selected inferred name appears more than five times and none carries a chain brand key",
    };
  })(),
  unknownHardAssignmentsSelected: selected.filter((row) =>
    ["marketSize", "businessForm", "sourceStatus", "censusDivision"].some(
      (field) => row.fieldEvidence?.[field]?.confidence === "unknown",
    ),
  ).length,
  duplicateStableIdsReviewed: normalizationLog.stableIdDuplicateGroups,
  conflictingMarketDuplicatesReviewed:
    normalizationLog.conflictingMarketGroupsResolvedByCbsaEvidence,
  directAlternateSubstitutionsValidated: alternates.length,
};
writeJson(path.join(OUT, "national-v1-review-log.json"), reviewLog);

for (const file of [
  manifestPath,
  alternatesPath,
  path.join(OUT, "national-v1-stage2-hashes.json"),
  path.join(OUT, "national-v1-exclusion-log.json"),
  path.join(OUT, "national-v1-review-log.json"),
]) {
  fs.chmodSync(file, 0o600);
}

console.log(
  JSON.stringify(
    {
      verdict: "feasible",
      candidateFrameSha256: manifest.candidateFrameSha256,
      normalizedEligibleRows: eligibleRows.length,
      normalization: normalizationLog,
      seedCommitment,
      selector: manifest.selector,
      quotas: manifest.quotas,
      descriptiveCuisine: cuisineSummary,
      alternates: alternates.length,
      manifestSha256: sha256(fs.readFileSync(manifestPath)),
      alternatesSha256: sha256(fs.readFileSync(alternatesPath)),
      stage2HashesSha256: sha256(
        fs.readFileSync(path.join(OUT, "national-v1-stage2-hashes.json")),
      ),
      unknownHardAssignmentsSelected: reviewLog.unknownHardAssignmentsSelected,
      inferredBusinessAssignmentsSelected:
        reviewLog.inferredBusinessAssignmentsSelected,
    },
    null,
    2,
  ),
);
