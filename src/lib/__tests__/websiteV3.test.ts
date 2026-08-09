import { describe, expect, it } from "vitest";
import { chooseAdaptiveRoute, discoverMenuImages, isTrustedCrawlUrl, normalizeMenuItemName, parseLooseMenuDom, parseSemanticMenuDom, parseSitemapMenuLinks, parseUnpricedMenuDom, safePublicUrl } from "../../crawler/websiteV3";
import { parseCapturedMenuPayloads } from "../menuSources";

describe("website acquisition V3 routing", () => {
  it("escalates a blocked direct request through progressively stronger free fetchers", () => {
    expect(chooseAdaptiveRoute({ httpOk: false, blocked: true, htmlLength: 0, itemCount: 0, platforms: [], renderedAlready: false }))
      .toEqual(["curl_cffi", "patchright"]);
  });

  it("uses browser/network capture for a detected ordering platform", () => {
    expect(chooseAdaptiveRoute({ httpOk: true, blocked: false, htmlLength: 10_000, itemCount: 3, platforms: ["toast"], renderedAlready: false }))
      .toEqual(["patchright"]);
  });

  it("does not pay the browser cost when direct structured extraction succeeded", () => {
    expect(chooseAdaptiveRoute({ httpOk: true, blocked: false, htmlLength: 10_000, itemCount: 20, platforms: [], renderedAlready: false }))
      .toEqual([]);
  });
});

describe("website acquisition V3 normalization", () => {
  it("does not wander into unrelated redirects or platform marketing sites", () => {
    expect(isTrustedCrawlUrl("https://restaurant.example.com/menu", "https://www.example.com")).toBe(true);
    expect(isTrustedCrawlUrl("https://order.toasttab.com/online/zen-curry", "https://example.com", "Zen Curry and Grill")).toBe(true);
    expect(isTrustedCrawlUrl("https://papa-feta-temecula.cloveronline.com/menu", "https://papafeta.co", "PapaFeta")).toBe(true);
    expect(isTrustedCrawlUrl("https://bangkok-chef.cloveronline.com/menu", "https://951thaifood.example", "951 Thai Food Restaurant")).toBe(false);
    expect(isTrustedCrawlUrl("https://get.popmenu.com/solutions/full-menu", "https://example.com", "Example Grill")).toBe(false);
    expect(isTrustedCrawlUrl("https://unrelated-retailer.example/menu", "https://example.com", "Example Grill")).toBe(false);
  });

  it("normalizes equivalent dish labels deterministically", () => {
    expect(normalizeMenuItemName("  Crème-Brûlée!! ")).toBe("creme brulee");
  });

  it("accepts only public HTTP URLs", () => {
    expect(safePublicUrl("/menus/dinner.pdf", "https://example.com")).toBe("https://example.com/menus/dinner.pdf");
    expect(safePublicUrl("data:text/plain,nope")).toBeUndefined();
  });

  it("normalizes integer-cent prices captured from ordering APIs", () => {
    expect(parseCapturedMenuPayloads([{ name: "Galbi Combo", price: 3099 }]))
      .toEqual([expect.objectContaining({ name: "Galbi Combo", price: 30.99 })]);
  });

  it("recovers menu routes from a site map without leaving the restaurant", () => {
    const xml=`<urlset><url><loc>https://example.com/about</loc></url><url><loc>https://example.com/our-menu</loc></url><url><loc>https://other.example/menu</loc></url></urlset>`;
    expect(parseSitemapMenuLinks(xml,"https://example.com","Example Grill")).toEqual(["https://example.com/our-menu"]);
  });
});

describe("website acquisition V3 menu recovery", () => {
  it("extracts explicit price-free dish fields and legacy inline menu cards", () => {
    const html=`<section id="menu"><ul><li><div class="dishName">Serrano Burrito</div><div class="dishDescription">Rice, beans and guacamole.</div></li></ul>
      <div class="menu-text"><h4>French Toast</h4><h5>Butter and maple syrup.</h5></div>
      <div class="menu-text"><h4>Breakfast</h4><h6>Bacon &amp; Eggs</h6><h6>Steak &amp; Eggs</h6></div></section>`;
    expect(parseSemanticMenuDom(html)).toEqual(expect.arrayContaining([
      expect.objectContaining({name:"Serrano Burrito",description:"Rice, beans and guacamole."}),
      expect.objectContaining({name:"French Toast"}),expect.objectContaining({name:"Bacon & Eggs"}),
    ]));
  });

  it("extracts generated-class menu layouts using name, description, price order", () => {
    const html = `<main><h1>Kitchen Menu</h1>
      <div><h3>Seared Sea Bass Plate</h3><p>Served with lemon herb rice and asparagus.</p><p>$19.95</p></div>
      <div><h3>Thai Chicken Curry Bowl</h3><p>Coconut, lemongrass and spices.</p><p>$14.95</p></div>
      <div><h3>Grass-Fed Tri-Tip Bowl</h3><p>Grilled with chimichurri.</p><p>$15.50</p></div>
      <div><h3>Vegan Avocado Hummus Sandwich</h3><p>Avocado, hummus and arugula.</p><p>$12.25</p></div></main>`;
    expect(parseLooseMenuDom(html)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Seared Sea Bass Plate", price: 19.95 }),
      expect.objectContaining({ name: "Vegan Avocado Hummus Sandwich", price: 12.25 }),
    ]));
  });

  it("recognizes explicitly named image menus without treating a logo as a document", () => {
    const html = `<img src="/logo.png" alt="logo"><img src="/menu-page-1.jpg" alt="Food Menu Page 1" width="1200" height="1800">`;
    expect(discoverMenuImages(html,"https://restaurant.example/menu",true)).toEqual(["https://restaurant.example/menu-page-1.jpg"]);
  });

  it("recovers original Squarespace menu booklets instead of their thumbnails", () => {
    const original="https://images.squarespace-cdn.com/content/Spokane+Menu+Booklet.jpg";
    const html=`<img src="${original}?format=100w" data-image="${original}" data-image-dimensions="4200x2550" alt="">`;
    expect(discoverMenuImages(html,"https://www.woodencityspokane.com/menu",true)).toEqual([original]);
  });

  it("recovers a repeated visual menu that intentionally omits prices",()=>{
    const html=`<main>${["Fried Calamari","Pizza Margherita","Pizza Regina","Tuna Salad","Cheese Garlic Bread"].map((name,index)=>`<div class="wixui-rich-text"><p style="font-size:20px">${name}</p><p style="font-size:15px">Fresh description number ${index}</p></div>`).join("")}</main>`;
    expect(parseUnpricedMenuDom(html).map(item=>item.name)).toContain("Pizza Margherita");
  });
});
