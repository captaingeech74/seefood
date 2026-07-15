#!/usr/bin/env -S npx tsx
// Replaces LRay's Kitchen's fixture menu with real data from Kyle's source
// Notion page ("Lindsay's Master Menu"): the table rows ARE the menu items,
// the table's photo attachments ARE the dish photos. Only rows with at
// least one photo are loaded (Kyle: "load all the dishes in the table that
// have at least one photo"); the "Break Glass" page and "The Rotation"
// section are deliberately excluded (no photo data, so meaningless here).
// Descriptions are used from the table's "How To" text only where it reads
// as a description rather than step-by-step cooking instructions — Kyle
// was explicit not to force irrelevant recipe-instruction text in.
//
// Photo URLs point at Notion's own public image proxy (mau5er.notion.site),
// which is fetchable unauthenticated and transcodes HEIC source photos to
// JPEG automatically — confirmed live before writing this script.
//
// Run with: npx tsx scripts/seed-lrays-kitchen-from-notion.ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvLocal() {
  const content = readFileSync(join(ROOT, ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const PLACE_ID = "ChIJa7SNNcl_24ARGN-49KRUqPI"; // LRay's Kitchen fixture

interface NotionDish {
  name: string;
  description: string | null;
  imgs: string[];
}

const DISHES: NotionDish[] = [
  { name: "Shepherd's Pie", description: "A hearty bake of sautéed vegetables and seasoned ground beef, topped with cheesy mashed potatoes and a hint of crushed red pepper.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fc5e72e5c-504e-44f6-be4c-8227b57e6e3f%2Fsp.jpeg?id=34b22ffd-db48-464d-9b84-39baa02d97f9&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Pork Loin & Mashed Potatoes", description: "Roasted pork loin served with a side of creamy mashed potatoes.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F5ba3f86c-81fc-45ac-9c8d-6d4898cae526%2F20220303_193409.jpg?id=40318eb1-95b0-410b-8dd9-849b1189c74b&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Mushroom Pizza", description: "A mushroom-topped pizza, kept simple and classic.", imgs: [
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fd3a612b2-739c-41dc-87de-0a6aa31b438a%2F20220304_194605.jpg?id=00afab2e-6180-4dec-ab7f-250320c49671&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F829923e8-a74c-4b28-a8a2-acc73284787e%2F20220304_191812.jpg?id=00afab2e-6180-4dec-ab7f-250320c49671&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
  ] },
  { name: "Baked Chicken Tacos", description: "Shredded crockpot chicken baked in tortillas with melted, crispy cheese, topped with lettuce and a lightened-up crema.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Ffef64288-c0e3-4886-9713-d35e4dd7cff7%2F20220310_192133.jpg?id=4912cfc1-a208-4599-abed-edccf0a84dc1&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Stuffed Chicken", description: "Sun-dried tomato and mushroom stuffed chicken with red pepper and swiss cheese under a light panko crust, served over mashed potatoes in a mushroom marsala sauce.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F023be66f-63e6-4a55-8972-576928e053c7%2F20220329_190609.jpg?id=8e4a8044-5fb6-44b9-b039-5bd679042712&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Chicken Parm w/ Sauteed Greens", description: "Breaded chicken breast topped with bruschetta sauce and a thick slice of melted mozzarella, served with lemon-shallot sautéed spinach and cauliflower.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F7f5335f0-9682-44cc-a348-0221da3844a3%2F20220401_190600.jpg?id=976a5d76-5b43-452c-82dc-b8d5e3ad022c&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Spicy Korean Beef Tacos", description: "Spicy Korean-style ground beef tacos loaded with fresh vegetables.", imgs: [
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F47c87027-bbba-47ae-8273-cbc17023a82c%2F20220411_193817.jpg?id=754bc999-52d3-4853-878f-2a259f390277&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F681f91a5-1122-43b0-8b0e-a5e21ea679d1%2F20220615_174201.jpg?id=754bc999-52d3-4853-878f-2a259f390277&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
  ] },
  { name: "Chicken Yellow Curry", description: "A Trader Joe's yellow curry simmered with coconut cream, served over ginger-lime rice with sautéed vegetables and a finish of fresh cilantro.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F87fe093f-8fa6-4a15-b39f-630e766db1ca%2F20220604_192247.jpg?id=09dcafe4-425c-4430-a12c-6e675f69bd30&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Greek Chicken Salad", description: "A light, oil-and-vinegar based chicken salad with red onion, roasted chickpeas, and homemade croutons, topped with balsamic-marinated chicken.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fac0c2f0a-dc95-4ec8-bcc9-0af7beb29aea%2F20220713_185444.jpg?id=949ea85e-83a4-4720-9159-cfee20d196eb&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Air Fryer Chicken Katsu", description: "Thinly sliced chicken breast coated in panko and sesame seeds, air-fried and served over white ginger rice with toasted vegetables and sriracha mayo.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F5f023901-d6c5-41cc-a146-6ba89d585c72%2F20220712_174050.jpg?id=9e99cf51-cc2f-407c-862a-6086cdbaddae&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Meatballs & Spaghetti Squash", description: "Meatballs in a marinara sauce loaded with spinach and mushrooms, served over roasted spaghetti squash and topped with parmesan.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F1d08e47c-9191-46f1-a4b2-0824207c7991%2F20220714_184957.jpg?id=4f6c2a78-b2e4-46c5-86e9-7015b5911695&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Salmon, Veggies & Power Greens", description: "Baked salmon with a sautéed power greens salad and a mix of roasted carrots and zucchini.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fd1a79d60-df3b-4ea4-a5c0-7fb256575213%2F20220711_174440.jpg?id=fb1d4ec8-3d24-4ac7-9ea3-c5fa86030465&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Rotisserie Chicken & Veggies", description: "Herb-butter basted rotisserie chicken with cauliflower and sweet potato mash.", imgs: [
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F759f87b6-04f8-4434-b448-38d92a44391e%2F20220717_183349.jpg?id=74946a8e-75f8-4047-abd2-ad0e104e552d&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F241e57a6-6b6b-4ec3-8137-0112dbdf33e9%2F20220717_183353.jpg?id=74946a8e-75f8-4047-abd2-ad0e104e552d&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
  ] },
  { name: "Classic Beef Enchiladas", description: "Beef enchiladas in corn tortillas with sauce, vegetables, and cheese, dressed generously with a cilantro-lime crema.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F1bcdf286-27a8-4e60-9b4e-134df38bb6d1%2F20220718_180418.jpg?id=d2676425-144d-460f-837b-c6ad066f5990&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Salmon Rainbow Salad", description: "Baked salmon over a colorful chopped salad of cabbage, carrot, green onion, broccoli, lettuce, and bell pepper, tossed in a sesame-ginger dressing and finished with avocado.", imgs: [
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fda7a2861-af08-4ba2-9059-2328074c6cdb%2F20220922_193048.jpg?id=09a248e0-e91a-4e07-839e-012eabbd7710&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fed4b8960-0878-447f-b157-64264866e5e4%2F20220922_192728.jpg?id=09a248e0-e91a-4e07-839e-012eabbd7710&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
  ] },
  { name: "Greek Chicken & Vegetables", description: "Marinated grilled chicken with homemade tzatziki, ginger rice, and vegetables.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F0665c7f6-1b25-4320-ad42-b40266c01875%2F20230601_184007.jpg?id=cfbf3658-5f94-4e44-880d-36604376e3ac&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Spare Ribs & Coleslaw", description: "Slow-cooked spare ribs with coleslaw, a naked mashed sweet potato, and a jiffy cornbread muffin.", imgs: [
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fd8f1573a-aff6-496f-b02c-5cb3cc51915d%2F20230527_201442.jpg?id=3878f691-eb55-4463-acd5-f4bc97312b96&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
    "https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F182ded13-143d-4837-b5e7-2c55ee67190b%2F20230527_194342.jpg?id=3878f691-eb55-4463-acd5-f4bc97312b96&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
  ] },
  { name: "Airfried Beef Taquitos", description: "Crispy air-fried beef taquitos.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Fd68306fb-d95f-4aa4-97f4-2c66c5a3dc25%2F20230503_181321.jpg?id=779594b8-673a-45af-981f-a8064d2a3f64&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Mushroom Cream Sun-Dried Tomato Pasta w/ Crispy Prosciutto", description: "A creamy mushroom and sun-dried tomato pasta topped with crispy prosciutto.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F1fd736f3-cdd0-4024-b108-fd871b23f778%2F20230501_183606.jpg?id=50f8817b-adeb-41c7-8dca-d96488fbce7e&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Thai Shrimp Spring Rolls", description: "Fresh Thai-style shrimp spring rolls.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F87e9f1d7-5245-4c57-8f7d-ee9f65dd7559%2F20230425_182443.jpg?id=83c688af-2a19-4c7e-b700-96b25e65dbe6&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Seared Ahi Salad", description: "A seared ahi tuna salad.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F4173ba92-e490-4933-aea4-43f67d0690f3%2F20230424_185226.jpg?id=95c68b3f-ad21-4fc8-bc22-e61114529b3e&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Miso Glazed Cod w/ Bok Choy", description: "Miso-glazed cod served with bok choy.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2F255dd5e0-12fe-4170-a4ff-97db89df8170%2F20230415_191026.jpg?id=c799035e-0ee5-4675-84b7-3cc043ca522b&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Thai Steak Salad", description: "A Thai-style steak salad.", imgs: [
    "https://mau5er.notion.site/image/attachment%3Aaf40887e-07f8-4c5d-8ac6-1320fa5886d3%3A20260106_185410.jpg?id=2e14617f-c450-80e7-b021-f41c32f4f449&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
    "https://mau5er.notion.site/image/attachment%3A31086726-64d6-4276-959b-ca5f7454d283%3AScreenshot_20260714_200757_Photos.jpg?id=2e14617f-c450-80e7-b021-f41c32f4f449&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
  ] },
  { name: "Chicken Thighs w/ Mushroom Shallot Marsala Sauce", description: "Chicken thighs in a mushroom and shallot marsala sauce.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fsecure.notion-static.com%2Ffd73a56c-3e8b-44fc-a00f-27ee6eeed235%2F20230411_183921.jpg?id=8f799dd0-442e-4114-8f58-84d8450d4ec1&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Hawaiian Chicken w/ Carrots & Bok Choy", description: "Hawaiian-style chicken with a standout side of carrots and baby bok choy.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F60cc0e06-f605-4c84-9f62-87307e87472c%2Fc655c060-d8d1-4a25-b77f-21b8804ff337%2F20240115_173525.jpg?id=d6f41872-6a67-4c44-b46a-b0e4a5fe1def&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Chicken Mushroom w/ Orzo & Kale", description: "Chicken and mushrooms with orzo and kale.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F60cc0e06-f605-4c84-9f62-87307e87472c%2F7c786b80-cd47-482a-9e73-9243dbbc4880%2F20240305_1846472.jpg?id=3beaed25-3181-4331-a6fc-348efd6d55db&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Roger's Famous Salsa", description: "A fresh salsa of green onion, cilantro, white onion, diced tomatoes, and jalapeño and serrano peppers, blended with tomato sauce and garlic salt.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F60cc0e06-f605-4c84-9f62-87307e87472c%2F2d76df7b-c14b-46c0-a21e-1dd5c370f0ce%2F20240513_185248.jpg?id=486ce136-a455-4f36-8d54-9f92e5e35857&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Miso Butter Salmon", description: "A perfectly baked salmon fillet topped with a homemade miso, honey, ginger, and soy butter, served over a rainbow slaw.", imgs: ["https://mau5er.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F60cc0e06-f605-4c84-9f62-87307e87472c%2Fc3b707d0-13cb-4b22-90ef-cfe64b7a4bfe%2F20240812_185730.jpg?id=0a94f6e1-3cb5-4a1f-8acb-176d9b7851ac&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Steak n Scallops", description: "Pan-seared steak and scallops.", imgs: [
    "https://mau5er.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F60cc0e06-f605-4c84-9f62-87307e87472c%2F10613d04-b04f-4a33-8513-8b5732a0aafa%2F20240908_190101.jpg?id=8d68ba56-64d3-49ea-a0ef-4c3b5408abdc&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
    "https://mau5er.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F60cc0e06-f605-4c84-9f62-87307e87472c%2F117a0063-89e9-4245-891b-eb1b00680cb1%2F20240908_190109.jpg?id=8d68ba56-64d3-49ea-a0ef-4c3b5408abdc&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl",
  ] },
  { name: "Chicken Broccoli Umami Hotdish", description: "A creamy baked pasta hotdish with rotisserie chicken, broccoli, zucchini, and mushrooms in a gruyere-swiss sauce, topped with toasted panko.", imgs: ["https://mau5er.notion.site/image/attachment%3A45e392bb-394f-4cf0-bf5d-6cfe60670a4d%3AScreenshot_20250520_195009_Photos.jpg?id=1fa4617f-c450-801f-8faa-d0138c3d9a6e&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Pesto Tomato Cream Gnocchi & Crispy Chicken", description: "Gnocchi in a basil-garlic pesto tomato cream sauce with red pepper flakes, served with crispy chicken.", imgs: ["https://mau5er.notion.site/image/attachment%3A65a08998-b14c-45ca-95e6-2def61ca8e96%3A20250611_175353.jpg?id=2104617f-c450-80d6-9c96-e25a2dbf4b20&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Butter Chicken", description: "A classic butter chicken.", imgs: ["https://mau5er.notion.site/image/attachment%3A6527a257-bedb-488a-9201-0dde89018e56%3AIMG_20250630_191937.heic?id=2234617f-c450-80be-acfc-ebc5f2ea6a88&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Steak Sandwich", description: "A steak sandwich.", imgs: ["https://mau5er.notion.site/image/attachment%3A0587214c-236f-4d03-b4cb-9d1922956efb%3A20250628_201250.jpg?id=2234617f-c450-8092-b4e1-fe9a73ba99d0&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "In-N-Out Burger Elevated", description: "A custom sauce, a whole layer of raw and grilled onion, and huge patties (with optional bacon) make this an elevated take on an In-N-Out burger.", imgs: ["https://mau5er.notion.site/image/attachment%3Ac794133b-2a54-45e1-90af-d6de0e17338a%3AIMG_20250703_111328.heic?id=2254617f-c450-8024-8716-f73e6eec6881&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Thai Chicken Spring Rolls", description: "Thai-style chicken spring rolls.", imgs: ["https://mau5er.notion.site/image/attachment%3A84d0587e-982d-4920-9705-7c341c0d1b8a%3A20250818_181953.jpg?id=2544617f-c450-803d-b204-f480921d0366&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
  { name: "Tom Kha Gai", description: "A Thai coconut chicken soup.", imgs: ["https://mau5er.notion.site/image/attachment%3A58bcecc1-ed58-45f2-a9c8-0fbbe0c1c5dc%3A20251008_184326.jpg?id=2874617f-c450-800e-99c1-d8bddac3e0e1&table=block&spaceId=60cc0e06-f605-4c84-9f62-87307e87472c&width=1600&userId=&cache=v2&imgBuildSrc=requestProxiedImageUrl"] },
];

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { uploadPhotoBuffer } = await import("../src/lib/storage");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`Clearing LRay's Kitchen's existing menu_items/photos ...`);
  await supabase.from("photos").delete().eq("restaurant_id", PLACE_ID);
  await supabase.from("menu_items").delete().eq("restaurant_id", PLACE_ID);

  let totalPhotos = 0;
  for (const dish of DISHES) {
    const { data: item, error: itemErr } = await supabase
      .from("menu_items")
      .insert({ restaurant_id: PLACE_ID, name: dish.name, description: dish.description, source: "schema_org", confidence: "high" })
      .select("id")
      .single();
    if (itemErr || !item) { console.error(`  FAILED menu_item ${dish.name}:`, itemErr?.message); continue; }

    let dishPhotoCount = 0;
    for (const imgUrl of dish.imgs) {
      const res = await fetch(imgUrl);
      if (!res.ok) { console.error(`  FAILED to fetch photo for ${dish.name}: HTTP ${res.status}`); continue; }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const key = `fixture-photos/lrays-kitchen/notion-${item.id}-${dishPhotoCount}.jpg`;
      const url = await uploadPhotoBuffer(buffer, contentType, key);
      if (!url) { console.error(`  FAILED to upload photo for ${dish.name}`); continue; }

      const { error: photoErr } = await supabase.from("photos").insert({
        restaurant_id: PLACE_ID,
        menu_item_id: item.id,
        origin_url: url,
        source: "schema_org",
        attribution: "owner",
        tier: 1,
        is_orderable: true,
        width: 1600,
        height: 1200,
      });
      if (photoErr) { console.error(`  FAILED to save photo row for ${dish.name}:`, photoErr.message); continue; }
      dishPhotoCount++;
      totalPhotos++;
    }
    console.log(`  ${dish.name}: ${dishPhotoCount} photos`);
  }

  console.log(`\nDone. ${DISHES.length} dishes, ${totalPhotos} photos.`);
  console.log(`Live at: https://seefood-rho.vercel.app/r/lrays-kitchen-temecula`);
}

main().catch((e) => { console.error(e); process.exit(1); });
