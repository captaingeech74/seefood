import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("db/migrations/2026-07-27-contribution-funnel-stage3.sql"),
  "utf8"
);

describe("DL-007 Stage 3 database contract", () => {
  it("preserves first receipts rather than overwriting them", () => {
    expect(migration).toContain("contribution_funnel_events_first_receipt");
    expect(migration).toContain(
      "on conflict (attempt_id, event_name, event_source, outcome) do nothing"
    );
  });

  it("records client/server failure stages and terminal publication", () => {
    for (const event of [
      "file_cancelled",
      "server_optimization_result",
      "storage_result",
      "post_storage_target_result",
      "photo_record_result",
      "publication_result",
      "verified_comparison_created",
    ]) {
      expect(migration).toContain(`'${event}'`);
    }
  });

  it("activates only inside the controlled all-gates terminal transition", () => {
    expect(migration).toContain("create or replace function review_contribution_photo");
    expect(migration).toContain("p_moderation = 'approved'");
    expect(migration).toContain("p_item_match in ('exact', 'strong')");
    expect(migration).toContain("p_duplicate_review = 'unique'");
    expect(migration).toContain("v_photo.rights_version = 'customer-photo-rights-v1'");
    expect(migration).toContain("p_rights_scope) = 'display_with_dish'");
    expect(migration).toContain("active = v_publish");
  });
});
