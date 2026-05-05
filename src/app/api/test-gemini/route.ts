import { NextResponse } from "next/server";

const VISION_KEY = process.env.VISION_API_KEY || process.env.GOOGLE_MAPS_API_KEY!;

// Quick Gemini connectivity test — visit /api/test-gemini in the browser
// to diagnose API key and model availability issues.
export async function GET() {
  const results: Record<string, unknown> = {
    key_prefix: VISION_KEY?.slice(0, 12) + "...",
  };

  // Test 1: List available models
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${VISION_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const listData = await listRes.json();
    results.models_status = listRes.status;
    if (listRes.ok) {
      const names = (listData.models ?? [])
        .map((m: { name: string }) => m.name)
        .filter((n: string) => n.includes("flash") || n.includes("pro"));
      results.available_flash_models = names;
    } else {
      results.models_error = listData;
    }
  } catch (e) {
    results.models_fetch_error = String(e);
  }

  // Test 2: Try a simple text-only prompt — current models for this account tier
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${VISION_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Say the word: hello" }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10 },
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const json = await res.json();
      results[`${model}_status`] = res.status;
      if (res.ok) {
        results[`${model}_response`] =
          json.candidates?.[0]?.content?.parts?.[0]?.text ?? "(empty)";
      } else {
        results[`${model}_error`] = json;
      }
    } catch (e) {
      results[`${model}_fetch_error`] = String(e);
    }
  }

  // Test 3: Try v1beta endpoint for gemini-1.5-flash (old path)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${VISION_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say the word: hello" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    const json = await res.json();
    results["v1beta_gemini_1_5_flash_status"] = res.status;
    if (res.ok) {
      results["v1beta_gemini_1_5_flash_response"] =
        json.candidates?.[0]?.content?.parts?.[0]?.text ?? "(empty)";
    } else {
      results["v1beta_gemini_1_5_flash_error"] = json;
    }
  } catch (e) {
    results["v1beta_fetch_error"] = String(e);
  }

  return NextResponse.json(results, { status: 200 });
}
