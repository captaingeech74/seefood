/**
 * Pluggable document OCR for website-acquisition workers.
 *
 * Native PDF text extraction happens before this module. These providers are
 * intentionally invoked only for image-only or structurally weak documents.
 * The default path is local and free; paid providers must be explicitly named.
 */
export type OcrProviderName = "paddleocr_vl" | "unlimited_ocr" | "mistral_ocr" | "generic_local";

export type OcrDocumentResult = {
  provider: OcrProviderName;
  text: string;
  pageCount: number;
  confidence?: number;
};

export type OcrAttempt = {
  provider: OcrProviderName;
  status: "completed" | "unavailable" | "failed";
  error?: string;
  elapsedMs: number;
};

export type OcrRouteResult = {
  result: OcrDocumentResult | null;
  attempts: OcrAttempt[];
};

function configuredProviders(): OcrProviderName[] {
  const raw = process.env.SEEFOOD_OCR_PROVIDERS ?? "paddleocr_vl";
  const allowed = new Set<OcrProviderName>(["paddleocr_vl", "unlimited_ocr", "mistral_ocr", "generic_local"]);
  return raw.split(",").map((value) => value.trim() as OcrProviderName).filter((value) => allowed.has(value));
}

async function paddle(bytes: Buffer): Promise<OcrDocumentResult | null> {
  const endpoint = (process.env.PADDLEOCR_VL_URL ?? "http://127.0.0.1:8119").replace(/\/$/, "");
  if (!endpoint) return null;
  const response = await fetch(`${endpoint}/document/parse`, {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!response.ok) throw new Error(`paddle_http_${response.status}`);
  const payload = await response.json() as { markdown?: string; text?: string; pageCount?: number };
  const text = payload.markdown ?? payload.text ?? "";
  return text ? { provider: "paddleocr_vl", text, pageCount: payload.pageCount ?? 0 } : null;
}

async function mistral(bytes: Buffer): Promise<OcrDocumentResult | null> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return null;
  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-4-0",
      document: {
        type: "document_url",
        document_url: `data:application/pdf;base64,${bytes.toString("base64")}`,
      },
      table_format: "html",
      extract_header: false,
      extract_footer: false,
    }),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) throw new Error(`mistral_http_${response.status}`);
  const payload = await response.json() as {
    pages?: Array<{ markdown?: string; confidence?: number }>;
  };
  const pages = payload.pages ?? [];
  const text = pages.map((page) => page.markdown ?? "").filter(Boolean).join("\n");
  const scores = pages.flatMap((page) => typeof page.confidence === "number" ? [page.confidence] : []);
  return text ? {
    provider: "mistral_ocr",
    text,
    pageCount: pages.length,
    confidence: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : undefined,
  } : null;
}

async function unlimited(bytes: Buffer): Promise<OcrDocumentResult | null> {
  // Unlimited-OCR currently targets NVIDIA/vLLM. Keep it behind a local
  // service contract so acquisition machines can use a GPU worker without
  // coupling the corpus worker to CUDA or trust_remote_code.
  const endpoint = process.env.SEEFOOD_UNLIMITED_OCR_URL?.replace(/\/$/, "");
  if (!endpoint) return null;
  const response = await fetch(`${endpoint}/document/parse`, {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    signal: AbortSignal.timeout(20 * 60_000),
  });
  if (!response.ok) throw new Error(`unlimited_ocr_http_${response.status}`);
  const payload = await response.json() as { markdown?: string; text?: string; pageCount?: number; confidence?: number };
  const text = payload.markdown ?? payload.text ?? "";
  return text ? { provider: "unlimited_ocr", text, pageCount: payload.pageCount ?? 0, confidence: payload.confidence } : null;
}

async function genericLocal(bytes: Buffer): Promise<OcrDocumentResult | null> {
  const endpoint = process.env.SEEFOOD_GENERIC_OCR_URL?.replace(/\/$/, "");
  if (!endpoint) return null;
  const response = await fetch(`${endpoint}/document/parse`, {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!response.ok) throw new Error(`generic_ocr_http_${response.status}`);
  const payload = await response.json() as { markdown?: string; text?: string; pageCount?: number; confidence?: number };
  const text = payload.markdown ?? payload.text ?? "";
  return text ? { provider: "generic_local", text, pageCount: payload.pageCount ?? 0, confidence: payload.confidence } : null;
}

/** First successful configured provider wins. Every attempt remains auditable. */
export async function runDocumentOcr(bytes: Buffer): Promise<OcrRouteResult> {
  const attempts: OcrAttempt[] = [];
  for (const provider of configuredProviders()) {
    const started = Date.now();
    try {
      const result = provider === "paddleocr_vl" ? await paddle(bytes)
        : provider === "unlimited_ocr" ? await unlimited(bytes)
          : provider === "mistral_ocr" ? await mistral(bytes)
            : await genericLocal(bytes);
      attempts.push({ provider, status: result ? "completed" : "unavailable", elapsedMs: Date.now() - started });
      if (result) return { result, attempts };
    } catch (error) {
      attempts.push({
        provider,
        status: "failed",
        error: String(error instanceof Error ? error.message : error).slice(0, 300),
        elapsedMs: Date.now() - started,
      });
    }
  }
  return { result: null, attempts };
}
