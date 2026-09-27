import {describe, it, expect} from "vitest";
import {automaticItemEligible, routeIsDue, structuredLocationProof} from "../structuredRollout";

const venue = {"@type":"Restaurant",name:"Good Kitchen",address:{streetAddress:"123 Main Street",addressLocality:"Spokane"}};
const html = (v: unknown) => `<script type="application/ld+json">${JSON.stringify(v)}</script>`;
describe("city-independent structured rollout", () => {
  it("requires restaurant name AND street AND city", () => {
    expect(structuredLocationProof(html(venue), "Good Kitchen", "123 Main Street, Spokane, WA")).toBeTruthy();
    expect(structuredLocationProof(html(venue), "Other Kitchen", "123 Main Street, Spokane, WA")).toBeUndefined();
    expect(structuredLocationProof(html(venue), "Good Kitchen", "125 Main Street, Spokane, WA")).toBeUndefined();
    expect(structuredLocationProof(html(venue), "Good Kitchen", "123 Main Street, Carlsbad, CA")).toBeUndefined();
    expect(structuredLocationProof(html(venue), "Good Kitchen")).toBeUndefined();
  });
  it("holds branch directories and ignores malformed metadata", () => {
    expect(structuredLocationProof(html([venue,{...venue,name:"Other Kitchen"}]),"Good Kitchen","123 Main Street Spokane")).toBeUndefined();
    expect(structuredLocationProof('<script type="application/ld+json">oops</script>',"Good Kitchen","123 Main Street Spokane")).toBeUndefined();
    expect(structuredLocationProof(html({"@graph":[venue,venue]}),"Good Kitchen","123 Main Street Spokane")).toBeTruthy();
  });
  it("new cities enter immediately; failures back off; successful platforms refresh monthly", () => {
    const now=Date.parse("2026-09-27T00:00:00Z");
    expect(routeIsDue(undefined,now)).toBe(true);
    expect(routeIsDue({at:"2026-09-20",status:"completed",hasPlatform:true},now)).toBe(false);
    expect(routeIsDue({at:"2026-08-20",status:"completed",hasPlatform:true},now)).toBe(true);
    expect(routeIsDue({at:"2026-08-20",status:"completed",hasPlatform:false},now)).toBe(false);
    expect(routeIsDue({at:"2026-09-20",status:"failed"},now)).toBe(true);
  });
  it("does not infer photo matches or transfer identity to a different page", () => {
    const item={confidence:0.9,method:"http:schema_org",evidenceUrl:"https://example.com/menu",item:{imageUrl:"https://example.com/food.jpg"}};
    const proven=new Set([item.evidenceUrl]);
    expect(automaticItemEligible(item,proven)).toBe(true);
    expect(automaticItemEligible({...item,method:"visible_menu"},proven)).toBe(false);
    expect(automaticItemEligible({...item,method:"http:schema_org+gallery:named_food_photo"},proven)).toBe(false);
    expect(automaticItemEligible({...item,evidenceUrl:"https://other.com/menu"},proven)).toBe(false);
    expect(automaticItemEligible({...item,item:{}},proven)).toBe(false);
  });
});
