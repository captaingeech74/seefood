export type AnalyticsEventName = "app_open" | "love" | "share" | "photo_add";

export function getVisitorId(): string {
  const key = "seefood-visitor-id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `ephemeral-${crypto.randomUUID()}`;
  }
}

export function trackEvent(
  eventName: AnalyticsEventName,
  restaurantId?: string,
  metadata?: Record<string, string | number | boolean>
): void {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, visitorId: getVisitorId(), restaurantId, metadata }),
    keepalive: true,
  }).catch(() => {});
}

export function trackAppOpen(restaurantId?: string): void {
  const key = "seefood-app-open-recorded";
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {}
  trackEvent("app_open", restaurantId);
}
