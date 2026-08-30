import { describe, expect, it } from "vitest";
import { decideVisionModeration } from "../googleVisionModeration";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Google Vision upload policy", () => {
  it("accepts clear food and drink signals", () => {
    expect(decideVisionModeration({ labels: [{ description: "Food", score: 0.96 }] })).toBe("food");
    expect(decideVisionModeration({ labels: [{ description: "Cocktail", score: 0.91 }] })).toBe("food");
  });

  it("rejects clear explicit-content signals", () => {
    expect(decideVisionModeration({ labels: [], safeSearch: { adult: "LIKELY" } })).toBe("explicit");
    expect(decideVisionModeration({ labels: [], safeSearch: { racy: "VERY_LIKELY" } })).toBe("explicit");
  });

  it("rejects obvious unrelated images only when no food signal exists", () => {
    expect(decideVisionModeration({ labels: [{ description: "Dog", score: 0.94 }] })).toBe("non_food");
    expect(decideVisionModeration({
      labels: [
        { description: "Person", score: 0.98 },
        { description: "Dish", score: 0.88 },
      ],
    })).toBe("food");
  });

  it("allows uncertain images instead of discarding potentially useful food", () => {
    expect(decideVisionModeration({ labels: [{ description: "Tableware", score: 0.92 }] })).toBe("uncertain");
    expect(decideVisionModeration({ labels: [{ description: "Person", score: 0.6 }] })).toBe("uncertain");
  });
});

describe("Google Vision zero-spend database guard", () => {
  const migration = readFileSync(
    resolve("db/migrations/2026-08-29-google-vision-zero-spend-guard.sql"),
    "utf8"
  );

  it("serializes claims and stops below the free monthly tier", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("request_count < 800");
    expect(migration).toContain("request_count between 0 and 800");
  });

  it("keeps the counter private to the server role", () => {
    expect(migration).toContain("revoke all on public.google_vision_upload_usage from anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_google_vision_upload_request() to service_role");
  });
});
