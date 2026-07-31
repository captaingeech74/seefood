import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("db/migrations/2026-07-31-datalab-v1-production-carryforward.sql"),
  "utf8"
);

describe("DataLab 1.0 production carry-forward", () => {
  it("separates historical claimed comparisons from verified coverage", () => {
    expect(migration).toContain("coverage_v2_verified_metrics");
    expect(migration).toContain("claimedComparisonCoverage");
    expect(migration).toContain("verified_comparison_created");
    expect(migration).toContain("gold_management_counterpart");
  });

  it("records reproducible crawler evidence", () => {
    for (const column of ["source_snapshot_id", "provider_url", "response_hash", "evidence_hash", "failure_stage", "metadata"]) {
      expect(migration).toContain(column);
    }
  });

  it("keeps the reusable merchant path open for Flipdish", () => {
    expect(migration).toContain("'flipdish'");
  });
});
