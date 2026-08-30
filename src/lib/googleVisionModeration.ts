import { claimGoogleVisionUploadRequest } from "./googleUsageGuard";

export type VisionLikelihood =
  | "UNKNOWN"
  | "VERY_UNLIKELY"
  | "UNLIKELY"
  | "POSSIBLE"
  | "LIKELY"
  | "VERY_LIKELY";

export interface VisionLabel {
  description: string;
  score: number;
}

export interface VisionSignals {
  labels: VisionLabel[];
  safeSearch?: {
    adult?: VisionLikelihood;
    racy?: VisionLikelihood;
    violence?: VisionLikelihood;
  };
}

export type VisionDecision = "food" | "explicit" | "non_food" | "uncertain";

export interface VisionModerationResult {
  checked: boolean;
  decision: VisionDecision | "skipped";
  reject: boolean;
  durationMs: number;
  abuseFlags: string[];
}

const FOOD_LABELS = [
  "food", "dish", "cuisine", "meal", "ingredient", "recipe", "cooking",
  "produce", "vegetable", "fruit", "meat", "seafood", "dessert", "baked goods",
  "bread", "breakfast", "lunch", "dinner", "snack", "fast food", "comfort food",
  "beverage", "drink", "cocktail", "coffee", "tea", "juice", "wine", "beer",
];

// Only used when Google finds no food signal. Ambiguous images are allowed;
// this blocks obvious unrelated uploads without claiming an exact dish match.
const NON_FOOD_LABELS = [
  "person", "people", "human", "selfie", "portrait", "face", "crowd",
  "dog", "cat", "pet", "animal", "building", "architecture", "house", "room",
  "interior design", "furniture", "vehicle", "car", "motor vehicle", "clothing",
  "apparel", "shoe", "electronics", "computer", "screenshot", "document",
  "advertising", "advertisement", "poster", "signage",
];

const likelihoodRank: Record<VisionLikelihood, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

function includesLabel(description: string, vocabulary: string[]): boolean {
  const normalized = description.trim().toLowerCase();
  return vocabulary.some((label) => normalized === label || normalized.includes(label));
}

export function decideVisionModeration(signals: VisionSignals): VisionDecision {
  const adult = likelihoodRank[signals.safeSearch?.adult ?? "UNKNOWN"];
  const racy = likelihoodRank[signals.safeSearch?.racy ?? "UNKNOWN"];
  const violence = likelihoodRank[signals.safeSearch?.violence ?? "UNKNOWN"];
  if (
    adult >= likelihoodRank.LIKELY ||
    racy >= likelihoodRank.VERY_LIKELY ||
    violence >= likelihoodRank.VERY_LIKELY
  ) {
    return "explicit";
  }

  const hasFood = signals.labels.some(
    (label) => label.score >= 0.55 && includesLabel(label.description, FOOD_LABELS)
  );
  if (hasFood) return "food";

  const obviousNonFood = signals.labels.some(
    (label) => label.score >= 0.82 && includesLabel(label.description, NON_FOOD_LABELS)
  );
  return obviousNonFood ? "non_food" : "uncertain";
}

function mode(): "off" | "shadow" | "enforce" {
  const value = process.env.GOOGLE_VISION_UPLOAD_MODE?.toLowerCase();
  return value === "shadow" || value === "enforce" ? value : "off";
}

export async function moderateUploadWithGoogleVision(
  image: Buffer
): Promise<VisionModerationResult> {
  const startedAt = Date.now();
  const moderationMode = mode();
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (
    moderationMode === "off" ||
    !apiKey ||
    !(await claimGoogleVisionUploadRequest())
  ) {
    return {
      checked: false,
      decision: "skipped",
      reject: false,
      durationMs: Date.now() - startedAt,
      abuseFlags: ["vision:skipped"],
    };
  }

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString("base64") },
              features: [
                { type: "LABEL_DETECTION", maxResults: 15 },
                { type: "SAFE_SEARCH_DETECTION" },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!response.ok) throw new Error(`Cloud Vision returned ${response.status}`);
    const payload = (await response.json()) as {
      responses?: Array<{
        error?: { message?: string };
        labelAnnotations?: Array<{ description?: string; score?: number }>;
        safeSearchAnnotation?: VisionSignals["safeSearch"];
      }>;
    };
    const result = payload.responses?.[0];
    if (!result || result.error) {
      throw new Error("Cloud Vision did not return an analysis");
    }
    const decision = decideVisionModeration({
      labels: (result.labelAnnotations ?? [])
        .filter(
          (label): label is { description: string; score: number } =>
            typeof label.description === "string" && typeof label.score === "number"
        )
        .map((label) => ({ description: label.description, score: label.score })),
      safeSearch: result.safeSearchAnnotation,
    });
    const reject =
      moderationMode === "enforce" &&
      (decision === "explicit" || decision === "non_food");
    return {
      checked: true,
      decision,
      reject,
      durationMs: Date.now() - startedAt,
      abuseFlags: [`vision:${decision}`],
    };
  } catch (error) {
    console.error(
      "[google-vision] optional upload check failed",
      error instanceof Error ? error.message : "unknown error"
    );
    return {
      checked: false,
      decision: "skipped",
      reject: false,
      durationMs: Date.now() - startedAt,
      abuseFlags: ["vision:unavailable"],
    };
  }
}
