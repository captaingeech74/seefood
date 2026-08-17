import { describe, expect, it } from "vitest";
import { parseVisibleMenuItems } from "../menuSources";
import { resolveIdentity } from "../acquisitionIdentity";

const incoming = {
  name: "The Boulder Tap House",
  lat: 42,
  lng: -93.6,
  address: "123 Main Street, Ames, IA 50010",
  website: "https://www.bouldertaphouse.com/ames-ia",
  phone: "(515) 555-1212",
};

describe("national acquisition identity gates", () => {
  it("recovers a location when a strong domain and location agree", () => {
    const result = resolveIdentity(incoming, [{
      id: "existing", name: "Boulder Tap House", lat: 42.0001, lng: -93.6001,
      address: "123 Main St Ames IA 50010", website: "http://bouldertaphouse.com/", phone: null,
    }]);
    expect(result.disposition).toBe("match");
    expect(result.evidence?.reasonCodes).toContain("domain_equal");
  });

  it("does not merge a nearby cuisine substitute", () => {
    const result = resolveIdentity({ ...incoming, name: "Olive Garden" }, [{
      id: "campinis", name: "Campini's Italian Restaurant", lat: 42.0001, lng: -93.6001,
      address: "999 Other Road", website: "https://campinis.example", phone: "5155559999",
    }]);
    expect(result.disposition).toBe("new");
  });

  it("quarantines two equally strong colocated candidates", () => {
    const candidates = ["a", "b"].map((id) => ({
      id, name: incoming.name, lat: incoming.lat, lng: incoming.lng,
      address: incoming.address, website: incoming.website, phone: incoming.phone,
    }));
    expect(resolveIdentity(incoming, candidates).disposition).toBe("quarantine");
  });

  it("keeps a true omission as a new identity", () => {
    expect(resolveIdentity(incoming, [])).toEqual({ disposition: "new", evidence: null, alternatives: [] });
  });

  it("does not merge differently named restaurants inside the same resort", () => {
    const result = resolveIdentity({
      ...incoming,
      name: "Krystal",
      parentEntityId: "riu-palace",
    }, [{
      id: "agave",
      name: "Agave",
      lat: incoming.lat,
      lng: incoming.lng,
      address: incoming.address,
      website: incoming.website,
      phone: incoming.phone,
      parentEntityId: "riu-palace",
    }]);
    expect(result.disposition).toBe("new");
    expect(result.alternatives[0]?.reasonCodes).toContain("distinct_resort_subvenue");
  });
});

describe("visible website menu extraction", () => {
  it("requires menu-card structure and a price", () => {
    const items = parseVisibleMenuItems(`<div class="menu-item"><h3>Wood-Fired Branzino</h3><p>lemon and herbs</p><span>$31.00</span><img src="/fish.jpg"></div>`);
    expect(items).toEqual([expect.objectContaining({ name: "Wood-Fired Branzino", price: 31, imageUrl: "/fish.jpg" })]);
    expect(parseVisibleMenuItems(`<article><h3>About our restaurant</h3><p>Welcome</p></article>`)).toEqual([]);
  });
});
