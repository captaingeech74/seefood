#!/usr/bin/env -S npx tsx
import { verifiedSupabaseSsl } from "./lib/verifiedSupabaseSsl.mjs";

/** Current, dish-linked Eggplants menu evidence from its exact Uber Eats venue page. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { fingerprintPhoto, isImageContentType } from "../src/lib/photoFingerprint";
import type { MenuItemData } from "../src/lib/types";

const PLACE_ID = "seefood:d2044ace-5aaf-4e98-a5ba-b5b1006bf159";
const ROOT = "https://tb-static.uber.com/prod/image-proc/processed_images";
const photo = (name: string, asset: string, description?: string): MenuItemData => ({
  name, description, imageUrl: `${ROOT}/${asset}/a1681d67ebe55c76c3af5f401619c278.jpeg`, source: "ubereats",
});

const MENU: MenuItemData[] = [
  photo("Pad Thai Noodle", "7cab99daa1f221330f858f6eb6b665e0", "Thin rice noodles, tamarind sauce, egg, bean sprouts, green onion, and ground peanuts"),
  photo("Potsticker", "b87a77ddfb17af3c97bde8d812e112fd", "Chicken and cabbage dumplings with dumpling sauce"),
  photo("Yellow Curry", "3d6b794f31f1579a4ad4d84ac2afd475", "Mild yellow coconut curry with potatoes, carrots, and onion"),
  photo("Bangkok Fried Rice", "a26e21082089665affab71883b55bb28", "Fried rice with egg, tomatoes, onion, and green onion"),
  photo("Eggplants", "1959f8d327f7d612d7f807e2669d39c2", "Eggplant, onion, bell pepper, and sweet basil in black bean garlic sauce"),
  photo("Spicy Wonton", "a98b7341ed1820ab793778e27053ac72", "Chicken wontons in sesame-sriracha soy glaze"),
  photo("Crispy Fried Pork", "1d16e84dfbfa85199cdf13c68db5779f", "Crispy marinated pork with sticky rice and tamarind dipping sauce"),
  photo("Cupid Wings", "a6bdc1be542aa779ffa24e93d495536a", "Crispy chicken wings with sweet and spicy sauce"),
  photo("Som-Tum", "53b3b418102756936a3a4679a4b1de6f", "Green papaya, tomatoes, green beans, carrot, garlic, peanuts, and lime dressing"),
  photo("Dumplings Soup (Small)", "b3b533aa0b783cfb85dce65940f52bb8", "Chicken dumplings, baby bok choy, carrot, green onion, and cilantro in clear broth"),
  photo("Dumplings Soup (Large)", "f204eb64e40f362a387a4672aa5caefc", "Chicken dumplings, baby bok choy, carrot, green onion, and cilantro in clear broth"),
  photo("Kua Noodle", "eb100283ae2ebd3bd610298aceb1c655", "Stir-fried thick rice noodles with egg and green onion"),
  photo("Rad Na", "4a00ec2b5318cdbc2c997cfd55f0881d", "Flat rice noodles, Chinese broccoli, broccoli, carrot, and gravy"),
  photo("Crispy Rad Na Noodle", "3d387ee3f31438b169366193db3dd24a", "Crispy flat rice noodles, Chinese broccoli, broccoli, carrot, and gravy"),
  photo("Boat Noodle", "81e34ae4c25b744068df542a6b3a810d", "Thai noodle soup with pork or beef, meatball, bean sprouts, and Chinese broccoli"),
  photo("Crab Fried Rice", "aa8f376afd5424e75864f3dae55d4bc0", "Thai-style fried rice with real crab, green onion, and eggs"),
  photo("Yen Ta Fo (Pink Noodle Soup)", "d78adeff45dce401566c7867f43cad80", "Shrimp, squid, fish ball, tofu, bok choy, and mushroom in sweet-and-sour soup"),
  photo("Khao Soi Chicken Drumstick", "735e0ecb8db046c804503575f61b0d16", "Northern Thai coconut curry noodle soup with chicken drumsticks"),
  ...[
    "Egg Roll", "Egg Roll Shrimp", "Garden Roll Tofu", "Garden Roll Chicken", "Fried Tofu", "Tod Mun (Fish Cake)",
    "Satay Chicken", "Torpedo Shrimp", "Fried Wonton", "Edamame", "House Salad", "Green Apple Salad", "Larb",
    "Sassy Seafood Salad", "Spicy Beef Salad", "Papaya Salad Lao Style", "Tom Yum Soup (Small)", "Tom Yum Soup (Large)",
    "Tom Kha Soup (Small)", "Tom Kha Soup (Large)", "Vegetable Soup", "Wonton Soup", "Green Curry", "Red Curry",
    "Kang Panang", "Massaman", "Kra Prao (Basil)", "Pad See-Ew Noodle", "Drunken Noodle", "Pad Woonsen", "Khao Soi",
    "Chow Mein", "Noodle Soup with Fish Ball and Ground Pork", "Thai Basil Fried Rice", "Pineapple Fried Rice",
    "Khao Ka Prao Kai Dao (Hot Basil with Fried Egg)", "Thai Three-Flavored Fish", "Panang Salmon", "Crying Tiger",
    "Kang Phed Ped Yang (Roasted Duck Curry)", "Rice Soup with Shrimp", "Rice Soup with Fish Filet", "Coconut Ice Cream",
    "Fried Banana Cheesecake", "Fried Banana and Coconut Ice Cream", "Mango Sticky Rice",
  ].map((name) => ({ name, source: "ubereats" as const })),
];

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const verified: MenuItemData[] = [];
  for (const item of MENU) {
    if (!item.imageUrl) { verified.push(item); continue; }
    const response = await fetch(item.imageUrl, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !isImageContentType(response.headers.get("content-type"))) throw new Error(`Invalid image for ${item.name}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if ((metadata.width ?? 0) < 500 || (metadata.height ?? 0) < 400) throw new Error(`Image too small for ${item.name}`);
    verified.push({ ...item, ...(await fingerprintPhoto(bytes)), imageWidth: metadata.width, imageHeight: metadata.height });
  }
  if (!apply) {
    console.log(JSON.stringify({ mode: "preview", menuItems: verified.length, matchedPhotos: verified.filter((item) => item.contentHash).length }, null, 2));
    return;
  }
  const { persistSourceMenuItems } = await import("../src/lib/db");
  const snapshotId = await persistSourceMenuItems(PLACE_ID, "ubereats", verified);
  if (!snapshotId) throw new Error("Uber Eats evidence did not produce a source snapshot");
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password),
    ssl: verifiedSupabaseSsl(),
    application_name: "seefood-enrich-eggplants",
  });
  await db.connect();
  try {
    await db.query(
      `update photos set photo_quality_score=greatest(coalesce(photo_quality_score,0),92),
       dish_popularity_score=greatest(coalesce(dish_popularity_score,0),7),is_hero_candidate=true
       where restaurant_id=$1 and source='ubereats' and active and menu_item_id is not null`,
      [PLACE_ID]
    );
  } finally {
    await db.end();
  }
  console.log(JSON.stringify({ mode: "applied", snapshotId, menuItems: verified.length, matchedPhotos: verified.filter((item) => item.contentHash).length }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
