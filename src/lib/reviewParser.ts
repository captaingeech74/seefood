interface Review {
  text: string;
  rating?: number;
}

// Phrases that signal a food item name follows immediately
const FOOD_TRIGGERS = [
  "try the ", "tried the ", "had the ", "get the ",
  "ordered the ", "order the ", "love the ", "loved the ", "loved their ",
  "enjoy the ", "enjoyed the ", "recommend the ", "recommended the ",
  "try their ", "get their ", "got the ", "grab the ",
];

// Words that CONFIRM an extracted phrase is a food item
const FOOD_SUFFIXES = [
  "burger", "burgers", "sandwich", "sandwiches", "salad", "salads",
  "soup", "soups", "steak", "steaks", "pasta", "pizza", "pizzas",
  "wings", "taco", "tacos", "burrito", "burritos", "bowl", "bowls",
  "roll", "rolls", "sushi", "ramen", "pho", "curry", "rice",
  "cake", "pie", "tart", "tarts", "donut", "donuts", "croissant",
  "croissants", "bun", "buns", "bread", "toast", "waffle", "waffles",
  "pancake", "pancakes", "omelette", "eggs benedict", "bacon",
  "fries", "hash browns", "hash", "latte", "coffee", "cocktail",
  "margarita", "beer", "wine", "whiskey", "bourbon", "martini",
  "platter", "wrap", "quesadilla", "nachos", "guacamole", "flatbread",
  "meatball", "meatballs", "ribs", "brisket", "pulled pork",
  "cheesesteak", "reuben", "gyro", "falafel", "shawarma",
  "dumplings", "noodles", "fried rice", "lo mein", "pad thai",
  "tikka masala", "biryani", "naan", "samosa",
  "crab cake", "oyster", "oysters", "scallop", "scallops",
  "mac and cheese", "grilled cheese", "hot dog", "pretzel",
  "cheesecake", "brownie", "ice cream", "gelato",
  "muffin", "scone", "danish", "mousse", "tiramisu",
  "benedict", "scramble", "omelet", "skillet", "hash",
  "cheeseburger", "chicken fried", "country fried",
];

// Hard stop — any extracted phrase containing these words is rejected outright
const REJECT_PHRASES = new Set([
  // Opinion / quality words
  "prices", "price", "service", "staff", "atmosphere", "ambiance",
  "experience", "visit", "location", "parking", "wait", "line",
  "reasonable", "amazing", "awesome", "great", "good", "bad",
  "everything", "nothing", "something", "anyone", "everyone",
  "definitely", "highly", "always", "never", "usually",
  "little", "small", "large", "big", "huge", "tiny",
  "restaurant", "place", "spot", "cafe", "bar", "menu",
  "portion", "portions", "value", "money", "worth",
  // Relative pronouns, conjunctions, aux verbs — these sneak in when a comma is missing
  "which", "that", "who", "where", "when", "while", "although", "though",
  "with", "without", "from", "into", "onto", "upon", "about", "after",
  "and", "but", "or", "so", "yet", "for", "nor",
  "was", "were", "is", "are", "has", "have", "had", "been",
  "not", "just", "even", "also", "too", "very", "really", "quite",
  "here", "there", "this", "these", "those",
  "my", "our", "your", "their", "its", "his", "her",
  "we", "they", "you", "it", "he", "she",
  "off", "out", "up", "down", "over", "back",
  // Short function words / prepositions
  "to", "a", "an", "the", "of", "in", "on", "at", "by", "as",
  "if", "do", "did", "get", "got", "try", "go", "went",
]);

// Short known dish names that don't need a suffix to be valid
const KNOWN_DISHES = new Set([
  "eggs benedict", "french toast", "chicken fried steak", "biscuits and gravy",
  "fish and chips", "mac and cheese", "pad thai", "fried chicken",
  "prime rib", "new york strip", "ribeye", "filet mignon",
  "creme brulee", "chocolate lava cake", "bananas foster",
  "club sandwich", "blt", "reuben", "philly cheesesteak",
  "morning bun", "sticky bun", "cinnamon roll",
]);

function cleanPhrase(raw: string): string {
  return raw
    .trim()
    .replace(/[.,!?;:()"']+$/, "")  // strip trailing punctuation
    .replace(/^['"(]+/, "")          // strip leading punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isValidDish(phrase: string): boolean {
  const lower = phrase.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // Must be 1–5 words
  if (words.length < 1 || words.length > 5) return false;

  // Length bounds
  if (lower.length < 3 || lower.length > 40) return false;

  // Reject if starts with a number
  if (/^\d/.test(lower)) return false;

  // Reject if any word is in the reject list
  if (words.some((w) => REJECT_PHRASES.has(w))) return false;

  // Accept if it's a known dish
  if (KNOWN_DISHES.has(lower)) return true;

  // Accept if it ends with (or contains) a food suffix word
  for (const suffix of FOOD_SUFFIXES) {
    if (lower === suffix || lower.endsWith(" " + suffix) || lower.includes(suffix)) {
      return true;
    }
  }

  return false;
}

export function extractPopularDishes(reviews: Review[]): string[] {
  const counts = new Map<string, number>();

  for (const review of reviews) {
    const text = (review.text || "").toLowerCase();

    // Strategy 1: trigger phrase + following noun phrase (1–4 words)
    for (const trigger of FOOD_TRIGGERS) {
      let pos = 0;
      while ((pos = text.indexOf(trigger, pos)) !== -1) {
        pos += trigger.length;
        const remaining = text.slice(pos, pos + 60);
        // Grab up to 4 words, stop at punctuation
        const match = remaining.match(/^([a-z]+(?:\s+[a-z]+){0,3})(?=[.,!?;:\n]|$|\s{2})/);
        if (match) {
          const phrase = cleanPhrase(match[1]);
          if (isValidDish(phrase)) {
            counts.set(phrase, (counts.get(phrase) || 0) + 1);
          }
        } else {
          // Fallback: grab 1–3 words
          const fallback = remaining.match(/^([a-z]+(?:\s+[a-z]+){0,2})/);
          if (fallback) {
            const phrase = cleanPhrase(fallback[1]);
            if (isValidDish(phrase)) {
              counts.set(phrase, (counts.get(phrase) || 0) + 1);
            }
          }
        }
      }
    }

    // Strategy 2: look for phrases in quotes (high confidence)
    const quoted = [...text.matchAll(/["']([a-z][a-z\s]{2,30})["']/g)];
    for (const q of quoted) {
      const phrase = cleanPhrase(q[1]);
      if (isValidDish(phrase)) {
        counts.set(phrase, (counts.get(phrase) || 0) + 3); // quotes = high confidence
      }
    }

    // Strategy 3: explicit "X is/was amazing/delicious/etc"
    const praises = [...text.matchAll(/([a-z]+(?:\s+[a-z]+){0,3})\s+(?:is|was|are|were)\s+(?:amazing|delicious|incredible|fantastic|perfect|excellent|outstanding|phenomenal)/g)];
    for (const p of praises) {
      const phrase = cleanPhrase(p[1]);
      if (isValidDish(phrase)) {
        counts.set(phrase, (counts.get(phrase) || 0) + 2);
      }
    }
  }

  if (counts.size === 0) return [];

  // Sort by score descending
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => titleCase(name));

  // Deduplicate substrings (keep the longer/more specific name)
  const final: string[] = [];
  for (const name of sorted) {
    const lower = name.toLowerCase();
    const dominated = final.some((existing) => {
      const el = existing.toLowerCase();
      return el.includes(lower) || lower.includes(el);
    });
    if (!dominated) final.push(name);
    if (final.length >= 8) break;
  }

  return final;
}
