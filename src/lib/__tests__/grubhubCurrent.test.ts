import { describe, expect, it } from "vitest";

process.env.GOOGLE_MAPS_API_KEY ??= "test-key";

const { extractGrubhubItems, parseGrubhubSearchUrl } = await import("../google");

describe("current Grubhub acquisition", () => {
  it("selects the restaurant returned by the rendered search page", () => {
    const html = `
      <a href="/restaurant/himalayan-taste-indian-cuisine-temecula/6798008">Himalayan Taste</a>
      <a href="/restaurant/mantra-indian-cuisine-temecula/329004">Mantra Indian Cuisine</a>
    `;
    expect(parseGrubhubSearchUrl(html, "Mantra Indian Cuisine")).toBe(
      "https://www.grubhub.com/restaurant/mantra-indian-cuisine-temecula/329004/"
    );
  });

  it("rejects a cuisine substitute when the requested restaurant is absent", () => {
    const html = `
      <a href="/restaurant/campinis-deli-italiano-28860-old-town-front-st-temecula/3354751/">
        Campini's Deli Italiano
      </a>
    `;
    expect(parseGrubhubSearchUrl(html, "Olive Garden Italian Restaurant")).toBeNull();
  });

  it("rejects ambiguous same-brand locations", () => {
    const html = `
      <a href="/restaurant/bjs-restaurant--brewhouse-first-address/111111/">BJ's</a>
      <a href="/restaurant/bjs-restaurant--brewhouse-second-address/222222/">BJ's</a>
    `;
    expect(parseGrubhubSearchUrl(html, "BJ's Restaurant & Brewhouse")).toBeNull();
  });

  it("extracts current restaurant_gateway menu entities and ignores fee metadata", () => {
    const payload = {
      object: {
        data: {
          content: [
            {
              type: "MENU_ITEM",
              entity: {
                item_id: "1726550067",
                item_name: "Chicken Tikki Masala",
                item_description: "Boneless chicken in tomato and butter gravy.",
                item_price: { delivery: { value: 1599 } },
                media_image: {
                  base_url: "https://media-cdn.grubhub.com/image/upload/",
                  public_id: "hcg9jdrm53um7qxhciup",
                  format: "jpg",
                },
              },
            },
          ],
        },
      },
      restaurant_data: {
        restaurant_availability: {
          service_fee: {
            name: "Service fee",
            description: "A service fee applies.",
          },
        },
      },
    };

    const items: Array<{
      name: string;
      description?: string;
      imageUrl?: string;
      price?: number;
    }> = [];
    extractGrubhubItems(payload, items);

    expect(items).toEqual([
      {
        name: "Chicken Tikki Masala",
        description: "Boneless chicken in tomato and butter gravy.",
        imageUrl:
          "https://media-cdn.grubhub.com/image/upload/w_800,q_auto:good,fl_lossy,f_auto/hcg9jdrm53um7qxhciup",
        price: 15.99,
      },
    ]);
  });
});
