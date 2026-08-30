import { describe, expect, it } from "vitest";
import { attachNamedPhotosToMenuItems, canonicalizeWebsiteImageUrl, chooseAdaptiveRoute, discoverBoundedInternalLinks, discoverMenuImages, extractNamedWebsitePhotos, isTrustedCrawlUrl, namedPhotoDishMatchScore, normalizeMenuItemName, parseLooseMenuDom, parseSemanticMenuDom, parseSitemapMenuLinks, parseUnpricedMenuDom, safePublicUrl } from "../../crawler/websiteV3";
import { extractPageAssets, parseCapturedMenuPayloads } from "../menuSources";

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

  it("recovers GoDaddy lazy-loaded menu documents instead of the placeholder", () => {
    const original="https://img1.wsimg.com/menu/KCC-Menu-Breakfast-March-2026.jpg";
    const html=`<img src="/transparent.png" data-srclazy="${original}/:/rs=w:1240,cg:true,m" alt="">`;
    expect(discoverMenuImages(html,"https://konacraft.com/menu",true)).toEqual([
      original,
    ]);
    expect(extractPageAssets(html,"https://konacraft.com/menu").photoUrls).toContain(
      `${original}/:/rs=w:1240,cg:true,m`,
    );
    expect(canonicalizeWebsiteImageUrl(`${original}/:/rs=w:1240,cg:true,m`)).toBe(original);
  });

  it("recovers a repeated visual menu that intentionally omits prices",()=>{
    const html=`<main>${["Fried Calamari","Pizza Margherita","Pizza Regina","Tuna Salad","Cheese Garlic Bread"].map((name,index)=>`<div class="wixui-rich-text"><p style="font-size:20px">${name}</p><p style="font-size:15px">Fresh description number ${index}</p></div>`).join("")}</main>`;
    expect(parseUnpricedMenuDom(html).map(item=>item.name)).toContain("Pizza Margherita");
  });
});

describe("website acquisition V3 official gallery photos", () => {
  it("explores ordinary pages on a small site but removes hard crawl traps",()=>{
    const html=`<a href="/story">Story</a><a href="/private-dining">Private dining</a><a href="/chef">Chef</a>
      <a href="/privacy">Privacy</a><a href="/checkout">Checkout</a><a href="/gallery?utm_source=x">Gallery</a>`;
    expect(discoverBoundedInternalLinks(html,"https://restaurant.example/")).toEqual([
      "https://restaurant.example/story","https://restaurant.example/private-dining","https://restaurant.example/chef","https://restaurant.example/gallery",
    ]);
  });
  it("discovers bounded same-origin gallery and food pages", () => {
    const html=`<a href="/gallery">Gallery</a><a href="/our-food">Our Food</a><a href="/apparel">Shop</a>`;
    expect(extractPageAssets(html,"https://restaurant.example/").pageUrls).toEqual([
      "https://restaurant.example/gallery",
      "https://restaurant.example/our-food",
    ]);
  });

  it("collapses Squarespace size variants and rejects obvious non-food imagery", () => {
    const original="https://images.squarespace-cdn.com/content/dish/Chicken+Schnitzel.jpg";
    expect(canonicalizeWebsiteImageUrl(`${original}?format=100w`)).toBe(original);
    const html=`<img src="${original}?format=100w" data-image="${original}" alt="ENTREE - Chicken Schnitzel (1)_enhanced copy.jpg">
      <img src="${original}?format=1500w" alt="Chicken Schnitzel">
      <img src="/bar.jpg" alt="Wooden City bar interior"><img src="/shirt.jpg" alt="Mustard tee apparel">`;
    expect(extractNamedWebsitePhotos(html,"https://restaurant.example/gallery")).toEqual([
      expect.objectContaining({url:original,label:"chicken schnitzel"}),
    ]);
  });

  it("collapses Wix size variants to their original byte asset",()=>{
    const original="https://static.wixstatic.com/media/a1b2c3~mv2.jpg";
    expect(canonicalizeWebsiteImageUrl(`${original}/v1/fill/w_640,h_480,al_c,q_85/dinner.jpg`)).toBe(original);
  });

  it("uses a Wix rendition filename as evidence before collapsing its URL",()=>{
    const html=`<img src="https://static.wixstatic.com/media/a1b2c3~mv2.jpg/v1/fill/w_640,h_480/Beef-Broccoli.jpg" alt="">`;
    expect(extractNamedWebsitePhotos(html,"https://restaurant.example/menu")).toEqual([
      expect.objectContaining({url:"https://static.wixstatic.com/media/a1b2c3~mv2.jpg",label:"beef broccoli"}),
    ]);
  });

  it("rejects another branch selected through a same-site location parameter",()=>{
    expect(isTrustedCrawlUrl(
      "https://shawnodonnells.com/menu?location=Shawn%20O%27Donnell%27s%20Everett",
      "https://shawnodonnells.com/",
      "Shawn O'Donnell's Spokane",
      "719 N Monroe St, Spokane, WA 99201",
    )).toBe(false);
  });

  it("rejects an ordering storefront whose URL names a conflicting city",()=>{
    expect(isTrustedCrawlUrl(
      "https://blazepizza.olo.com/menu/blaze-pizza-menifee",
      "https://www.blazepizza.com/",
      "Blaze Pizza",
      "32195 Temecula Pkwy, Temecula, CA 92592",
    )).toBe(false);
    expect(isTrustedCrawlUrl(
      "https://order.toasttab.com/online/shawn-o-donnells-spokane",
      "https://www.shawnodonnells.com/",
      "Shawn O'Donnell's Spokane",
      "719 N Monroe St, Spokane, WA 99201",
    )).toBe(true);
  });

  it("rejects another branch page inside a same-site location directory",()=>{
    expect(isTrustedCrawlUrl(
      "https://goodtacos.com/restaurants/vista-way-oceanside/",
      "https://goodtacos.com/",
      "Los Tacos Temecula",
      "27780 Jefferson Ave, Temecula, CA 92590",
    )).toBe(false);
  });

  it("uses the acquisition market when the stored street address omits its city",()=>{
    expect(isTrustedCrawlUrl(
      "https://goodtacos.com/restaurants/vista-way-oceanside/",
      "https://goodtacos.com/",
      "Los Tacos",
      "32065 Temecula Pkwy",
      ["temecula-ca"],
    )).toBe(false);
    expect(isTrustedCrawlUrl(
      "https://goodtacos.com/restaurants/temecula-parkway/",
      "https://goodtacos.com/",
      "Los Tacos",
      "32065 Temecula Pkwy",
      ["temecula-ca"],
    )).toBe(true);
  });

  it("attaches a clearly named official photo only to its matching known dish", () => {
    const evidence=["Chicken Schnitzel","Salmon Toast","French Fries"].map((name,index)=>({
      item:{name,source:"schema_org" as const},method:"http:menu",evidenceUrl:"https://restaurant.example/menu",
      confidence:0.84,sourceKey:"schema_org",fingerprint:`before-${index}`,
    }));
    const attached=attachNamedPhotosToMenuItems(evidence,[
      {url:"https://cdn.example/chicken.jpg",label:"ENTREE - Chicken Schnitzel enhanced",evidenceUrl:"https://restaurant.example/gallery",method:"http"},
      {url:"https://cdn.example/interior.jpg",label:"dining room interior",evidenceUrl:"https://restaurant.example/gallery",method:"http"},
    ]);
    expect(attached.find(item=>item.item.name==="Chicken Schnitzel")?.item.imageUrl).toBe("https://cdn.example/chicken.jpg");
    expect(attached.find(item=>item.item.name==="Salmon Toast")?.item.imageUrl).toBeUndefined();
    expect(attached.find(item=>item.item.name==="French Fries")?.item.imageUrl).toBeUndefined();
  });

  it("allows harmless cooking modifiers but rejects a different overlapping dish",()=>{
    expect(namedPhotoDishMatchScore("Hungarian Wax Peppers","Blistered Hungarian Peppers")).toBe(85);
    expect(namedPhotoDishMatchScore("Corned Beef Benedict","Corned Beef Scrambler")).toBe(0);
    expect(namedPhotoDishMatchScore("Avo Garden Scramble","Avocado Garden Scramble")).toBe(100);
  });

  it("reads menu headings without cloning an unusually deep page tree",()=>{
    const deep=(name:string,price:number)=>`<h3>${name}${"<span>".repeat(2500)}detail${"</span>".repeat(2500)}</h3><p>$${price}</p>`;
    const html=[deep("Deep Dish Pizza",18),deep("Garden Salad",12),deep("Chicken Pasta",20),deep("Chocolate Cake",10)].join("");
    expect(parseLooseMenuDom(html)).toEqual(expect.arrayContaining([
      expect.objectContaining({name:"Deep Dish Pizza"}),
    ]));
  });
});
