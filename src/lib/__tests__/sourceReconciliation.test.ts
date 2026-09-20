import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mutations: [] as Array<{ table: string; value: Record<string, unknown> }> }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (table: string) => {
    let fields = "";
    const result = () => {
      if (table === "restaurants") return { data: { entity_id: "restaurant-entity" } };
      if (table === "source_registry") return { data: { enabled: true } };
      if (table === "source_snapshots") return { data: { id: "snapshot" } };
      if (table === "source_states") return { data: { consecutive_empty: 0 } };
      if (fields.includes("missing_streak")) return { data: [{ id: 42, source_key: "pancakes", origin_url: "https://example.com/pancakes.jpg", content_hash: "existing", missing_streak: 5 }] };
      return { data: [], count: 1 };
    };
    const query: Record<string, unknown> = {};
    for (const method of ["eq", "in", "single", "maybeSingle", "insert"]) query[method] = () => query;
    query.select = (value: string) => { fields = value; return query; };
    for (const method of ["update", "upsert"]) query[method] = (value: Record<string, unknown>) => {
      state.mutations.push({ table, value }); return query;
    };
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return query;
  } }),
}));

import { persistSourceMenuItems } from "../db";

describe("partial menu enrichment preserves existing coverage", () => {
  beforeEach(() => { state.mutations.length = 0; });

  it("does not retire or increment missing streaks when a partial crawl returns no items", async () => {
    await persistSourceMenuItems("restaurant", "popmenu", [], { partial: true });
    expect(state.mutations.filter(m => m.table === "menu_items" || m.table === "photos")).toEqual([]);
    expect(state.mutations.find(m => m.table === "source_snapshots")?.value.metadata).toMatchObject({ partial: true });
  });

  it("retains confirmed-absence retirement for an explicitly complete source snapshot", async () => {
    await persistSourceMenuItems("restaurant", "popmenu", []);
    const retired = state.mutations.filter(m => m.table === "menu_items" || m.table === "photos");
    expect(retired).toHaveLength(2);
    expect(retired.every(m => m.value.active === false && m.value.missing_streak === 6)).toBe(true);
  });
});
