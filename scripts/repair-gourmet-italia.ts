#!/usr/bin/env -S npx tsx

/** Rebuild Gourmet Italia from its current official menu and named gallery. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { fingerprintPhoto, isImageContentType } from "../src/lib/photoFingerprint";
import type { DishPhoto, MenuItemData } from "../src/lib/types";

const PLACE_ID = "ChIJGfaca8p_24ARGIljPv6vCJM";
const ADDRESS = "27499 Ynez Road, Temecula, CA 92591";

const MENU: MenuItemData[] = [
  { name: "Antipasto Italiano", description: "Imported Italian cured meats, cheeses, olives, and vegetables" },
  { name: "Crostini Positano", description: "Buffalo mozzarella, Roma tomatoes, basil, capers, olive oil, and toasted bread" },
  { name: "Bruschetta alla Siciliana", description: "Heirloom cherry tomatoes, basil, garlic, olive oil, and toasted bread" },
  { name: "Caprese", description: "Roma tomatoes and fresh buffalo mozzarella" },
  { name: "Burrata", description: "Fresh mozzarella filled with ricotta and strips of mozzarella" },
  { name: "Formaggi Misti", description: "Imported Italian and French cheeses with caramelized walnuts and sauces" },
  { name: "Carpaccio di Bue", description: "Tenderloin, celery, lemon, Parmigiano, and truffle oil" },
  { name: "Eggplant Parmigiana", description: "Lightly fried Sicilian-style eggplant, marinara, basil, and Grana Padano" },
  { name: "Calamari Fritti w/ Cherry Peppers", description: "Fried calamari, cherry peppers, tomato sauce, and mixed greens" },
  { name: "Cozze e Patatine", description: "P.E.I. mussels in white-wine garlic sauce with French fries" },
  { name: "Insalata Maremmana", description: "Mixed greens, tomatoes, Kalamata olives, feta, and vinaigrette" },
  { name: "Insalata Fattore", description: "Mixed greens, tomatoes, Kalamata olives, fresh mozzarella, and vinaigrette" },
  { name: "Insalata don Toto", description: "Tomatoes, basil, cucumber, red onions, oregano, vinaigrette, and olive oil" },
  { name: "Insalata del Nonno Nitto", description: "Sweet oranges, chives, mint, and olive oil" },
  { name: "Gourmet Italia Salad", description: "Poached pear, mixed greens, gorgonzola, caramelized walnuts, and balsamic reduction" },
  { name: "Pasta Italiana", description: "Spaghetti or penne with tomato-basil sauce or cream sauce" },
  { name: "Fettuccine alla Bolognese", description: "Fettuccine with meat sauce" },
  { name: "Tortellini alla Benigni", description: "Ham, peas, Parmigiano, and cream sauce" },
  { name: "Capellini alla Checca", description: "Fresh tomatoes, garlic, basil, and olive oil" },
  { name: "Ravioli Contadina", description: "Spinach-and-ricotta ravioli with tomato sauce and mushrooms" },
  { name: "Penne Primavera", description: "Farm-fresh vegetables, olive oil, and garlic" },
  { name: "Rigatoni alla Norma", description: "Grilled eggplant, tomato sauce, basil, and ricotta salata" },
  { name: "Gnocchi al Pesto o Pomodoro con Mozzarella", description: "Potato dumplings with pesto or tomato sauce and mozzarella" },
  { name: "Farfalle al Salmone", description: "Smoked salmon, onion, and capers in tomato cream sauce" },
  { name: "Fusilli Calabrese", description: "Chicken, mushrooms, sun-dried tomatoes, and tomato cream sauce" },
  { name: "Spaghetti Amatriciana", description: "Pancetta and onion in spicy marinara" },
  { name: "Fusilli al Filetto", description: "Filet mignon tips, mushrooms, red-wine tomato cream sauce, and gorgonzola" },
  { name: "Spaghetti alle Vongole Veraci", description: "Manila clams and parsley with red or white wine sauce" },
  { name: "Spaghetti Carbonara", description: "Pancetta, eggs, Parmigiano, and cracked black pepper" },
  { name: "Lasagne", description: "Bolognese, béchamel, Parmigiano, and mozzarella" },
  { name: "Pasta al Forno della Zia al Sugo di Carne", description: "Baked ziti, Bolognese, ham, peas, and béchamel" },
  { name: "Manicotti", description: "Ricotta-and-spinach manicotti with tomato cream sauce and béchamel" },
  { name: "Cannelloni", description: "Ricotta-filled cannelloni with meat sauce and béchamel" },
  { name: "Pollo Parmigiana", description: "Breaded chicken with tomato sauce, mozzarella, and Parmigiano" },
  { name: "Pollo Limone", description: "Chicken with lemon-butter sauce, capers, and pine nuts" },
  { name: "Pollo Marsala", description: "Chicken with Marsala wine sauce and mushrooms" },
  { name: "Vitello Parmigiana", description: "Breaded veal with tomato sauce, mozzarella, and Parmigiano" },
  { name: "Vitello Limone", description: "Veal with lemon-butter sauce, capers, and pine nuts" },
  { name: "Vitello Marsala", description: "Veal with Marsala wine sauce and mushrooms" },
  { name: "Polpette", description: "Meatballs" },
  { name: "Salsiccia", description: "Sausages" },
  { name: "French Fries" },
  { name: "Farm Fresh Veggies" },
  { name: "Fettuccine Alfredo" },
  { name: "Frutti di Mare" },
  { name: "Housemade Ravioli" },
  { name: "Pasta Pescatore" },
  { name: "Cannoli" },
  { name: "Gourmet Italia's Olive Tapenade" },
  { name: "Seafood Pasta Special" },
];

const GALLERY: Array<{ dish: string; asset: string }> = [
  ["Gourmet Italia Salad", "c3c5f8_c420fe71621c4ec6bc4b456970306938~mv2.jpg"],
  ["Frutti di Mare", "c3c5f8_cc6c688c65ad4a9b96ec18514f59189c~mv2.jpg"],
  ["Rigatoni alla Norma", "c3c5f8_6af1a42953c54135a0663b06c74559df~mv2.jpg"],
  ["Manicotti", "c3c5f8_3a008236139145209e86c528fab60eec~mv2.jpg"],
  ["Rigatoni alla Norma", "c3c5f8_a1105735d0d24a649075dbce09ffc9a1~mv2.jpg"],
  ["Rigatoni alla Norma", "c3c5f8_2e4d1371c09c4a0c907e49c965a8219a~mv2.jpg"],
  ["Gourmet Italia Salad", "c3c5f8_6e8f1f90ccb64d0ea89e150aca97f363~mv2.jpg"],
  ["Gourmet Italia Salad", "c3c5f8_95342c5a35f545f8937df8253f6fb894~mv2.jpg"],
  ["Pollo Parmigiana", "c3c5f8_f281072aa0d4461a81dd83312288b491~mv2.jpg"],
  ["Housemade Ravioli", "c3c5f8_fe65797e31ee41a395840ba632e8d807~mv2.jpg"],
  ["Pollo Limone", "c3c5f8_0e6fff55f7a24ae4b8feb472b895c305~mv2.jpg"],
  ["Pasta Pescatore", "c3c5f8_f9fd0091292242e2bc967710a33977a9~mv2.jpg"],
  ["Lasagne", "c3c5f8_f10377b3735b419eb1a3106a4cb6c570~mv2.jpg"],
  ["Cannoli", "c3c5f8_073ae1b168d741d3b5e30c0ee23f92ee~mv2.jpg"],
  ["Pollo Limone", "c3c5f8_3e04cfff3301401facf013866054243e~mv2.jpg"],
  ["Gnocchi al Pesto o Pomodoro con Mozzarella", "c3c5f8_540d0e31fba741c4b0c00dacddfbd77b~mv2.jpg"],
  ["Fusilli al Filetto", "c3c5f8_028d8343cf594bb09a64945e06bd78a7~mv2.jpg"],
  ["Calamari Fritti w/ Cherry Peppers", "c3c5f8_2cb8c70ce15542ab8157ee1b7e23fd9a~mv2.webp"],
  ["Antipasto Italiano", "c3c5f8_959a5ee5e78147f2a35248d1dbe10728~mv2.jpg"],
  ["Gourmet Italia's Olive Tapenade", "c3c5f8_f9381d8a6379466484a9b3cf221f7c62~mv2.jpg"],
  ["Spaghetti Carbonara", "c3c5f8_1f36d0e9b0de435dbfe72c2d6c714838~mv2.webp"],
  ["Seafood Pasta Special", "c3c5f8_e1a43e4b7f9a450585fc801e780705ed~mv2.jpg"],
].map(([dish, asset]) => ({ dish, asset }));

const REJECTED_GALLERY_ASSETS = [
  "c3c5f8_62b1deeb892d40e88277c72f866bb602~mv2_d_4256_2832_s_4_2.jpg", // candle, not Alfredo
  "c3c5f8_2daa8def3be84ce39bcc114b1202387b~mv2.jpg", // weak wide duplicate of a strong close dish
  "c3c5f8_87780383fa644f62806b6627e4a22733~mv2.jpg", // weak wide duplicate of a strong close dish
].map((asset) => `https://static.wixstatic.com/media/${asset}`);

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function preparePhotos(): Promise<DishPhoto[]> {
  const photos: DishPhoto[] = [];
  for (const candidate of GALLERY) {
    const url = `https://static.wixstatic.com/media/${candidate.asset}`;
    const response = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !isImageContentType(response.headers.get("content-type"))) continue;
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if ((metadata.width ?? 0) < 320 || (metadata.height ?? 0) < 240) continue;
    const hashes = await fingerprintPhoto(bytes);
    photos.push({
      id: `gourmet-official-${hashes.contentHash}`,
      url,
      dishName: candidate.dish,
      dishDescription: null,
      isMenuMatch: true,
      source: "schema_org",
      attribution: "owner",
      tier: 1,
      width: metadata.width,
      height: metadata.height,
      loveCount: 0,
      primaryVotes: 0,
      photoAuthorType: "management",
      trustLabel: "management_photo",
      photoQualityScore: 85,
      isHeroCandidate: true,
      isStorefront: false,
      isMenuPhoto: false,
      contentHash: hashes.contentHash,
      perceptualHash: hashes.perceptualHash,
    });
  }
  return photos;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const photos = await preparePhotos();
  if (!apply) {
    console.log(JSON.stringify({ mode: "preview", menuItems: MENU.length, validOfficialPhotos: photos.length, address: ADDRESS }, null, 2));
    return;
  }
  const { persistSourceMenuItems, persistSourcePhotos } = await import("../src/lib/db");
  const primaryByDish = new Map<string, DishPhoto>();
  for (const photo of photos) if (!primaryByDish.has(photo.dishName!)) primaryByDish.set(photo.dishName!, photo);
  const items = MENU.map((item) => {
    const photo = primaryByDish.get(item.name);
    return photo ? {
      ...item,
      imageUrl: photo.url,
      contentHash: photo.contentHash ?? undefined,
      perceptualHash: photo.perceptualHash ?? undefined,
    } : item;
  });
  const snapshotId = await persistSourceMenuItems(PLACE_ID, "schema_org", items);
  if (!snapshotId) throw new Error("Official menu persistence did not produce a snapshot");

  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("update restaurants set address=$2,website=$3,updated_at=now() where place_id=$1", [PLACE_ID, ADDRESS, "https://www.gourmetitaliatemecula.com/"]);
    await db.query("update restaurant_entities set address=$2,updated_at=now() where id=(select entity_id from restaurants where place_id=$1)", [PLACE_ID, ADDRESS]);
    await db.query("update restaurant_identities set address=$2,last_seen_at=now() where entity_id=(select entity_id from restaurants where place_id=$1) and provider='google'", [PLACE_ID, ADDRESS]);
    await db.query(
      `update photos set active=false,is_orderable=false,is_hero_candidate=false,
           dedupe_reason='official_gallery_visual_reject',deduped_at=now()
        where restaurant_id=$1 and origin_url=any($2::text[])`,
      [PLACE_ID, REJECTED_GALLERY_ASSETS]
    );
    await db.query("commit");
    const menuRows = (await db.query("select id,name from menu_items where restaurant_id=$1 and active", [PLACE_ID])).rows;
    const menuId = new Map(menuRows.map((row) => [row.name, Number(row.id)]));
    const additional = photos.filter((photo) => primaryByDish.get(photo.dishName!) !== photo).map((photo) => ({ ...photo, menuItemId: menuId.get(photo.dishName!) }));
    if (additional.length) await persistSourcePhotos(PLACE_ID, "schema_org", additional);
  } finally {
    await db.end();
  }
  console.log(JSON.stringify({ mode: "applied", snapshotId, menuItems: items.length, officialPhotos: photos.length, address: ADDRESS }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
