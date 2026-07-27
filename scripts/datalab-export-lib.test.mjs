import { describe, expect, it } from "vitest";
import {
  authorBasis,
  classifyCandidate,
  findSecretLeaks,
  redactLocator,
  selectBucketCandidates,
  stableRank,
} from "./datalab-export-lib.mjs";

describe("DL-001 export helpers", () => {
  it("uses the fixed calibration seed for stable ranks", () => {
    expect(stableRank("restaurant-1")).toBe(stableRank("restaurant-1"));
    expect(stableRank("restaurant-1")).not.toBe(stableRank("restaurant-2"));
    expect(stableRank("restaurant-1")).toHaveLength(64);
  });

  it("keeps the three bucket definitions mechanical", () => {
    expect(classifyCandidate({ sql_claim_count: 1, current_menu_count: 0, useful_photo_count: 0 }).bucket).toBe("sql_claimed");
    expect(classifyCandidate({ sql_claim_count: 0, current_menu_count: 7, useful_photo_count: 7 }).bucket).toBe("rich_unpaired");
    expect(classifyCandidate({ sql_claim_count: 0, current_menu_count: 6, useful_photo_count: 6 }).bucket).toBe("sparse");
    expect(classifyCandidate({ sql_claim_count: 0, current_menu_count: 8, useful_photo_count: 2 }).bucket).toBe("not_selected_bucket");
  });

  it("selects exactly four lowest hashes from each calibration bucket", () => {
    const rows = ["sql_claimed", "rich_unpaired", "sparse"].flatMap((bucket) =>
      Array.from({ length: 5 }, (_, index) => ({
        bucket,
        rank: String(index).padStart(2, "0"),
      }))
    );
    const selected = selectBucketCandidates(rows);
    expect(selected).toHaveLength(12);
    expect(selected.filter((row) => row.bucket === "sparse")).toHaveLength(4);
    expect(selected.some((row) => row.rank === "04")).toBe(false);
  });

  it("redacts locators while retaining a reproducible hash and coarse attachment class", () => {
    const redacted = redactLocator("https://images.example.test/private/photo.jpg?token=secret");
    expect(redacted).toEqual({
      kind: "absolute_https",
      host: "images.example.test",
      pathClass: "private/photo.jpg",
      locatorSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(redacted)).not.toContain("token=secret");
  });

  it("finds embedded credential values and describes author evidence conservatively", () => {
    expect(findSecretLeaks("prefix super-secret suffix", { API_KEY: "super-secret" })).toEqual(["API_KEY"]);
    expect(authorBasis({ source: "google", attribution: "user" }).strength).toContain("guardian");
    expect(authorBasis({ source: "user_upload" }).strength).toBe("direct_source_classification");
  });
});
