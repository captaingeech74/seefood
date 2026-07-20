import type { MenuItemData } from "./types";

export type MerchantProvider = "google_business" | "square" | "toast" | "clover";

export const MERCHANT_PROVIDERS: Array<{ id: MerchantProvider; name: string; env: string[]; value: string }> = [
  { id: "google_business", name: "Google Business Profile", env: ["GOOGLE_BUSINESS_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_SECRET"], value: "Food menu and business updates" },
  { id: "square", name: "Square", env: ["SQUARE_APPLICATION_ID", "SQUARE_APPLICATION_SECRET"], value: "Catalog items, variations, and images" },
  { id: "toast", name: "Toast", env: ["TOAST_CLIENT_ID", "TOAST_CLIENT_SECRET"], value: "Menus, groups, items, and images" },
  { id: "clover", name: "Clover", env: ["CLOVER_APP_ID", "CLOVER_APP_SECRET"], value: "Inventory items, categories, and images" },
];

export function merchantProviderAvailability() {
  return MERCHANT_PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
    value: provider.value,
    available: provider.env.every((key) => Boolean(process.env[key])),
  }));
}

export function normalizeMerchantItems(provider: MerchantProvider, payload: unknown): MenuItemData[] {
  const root = payload as Record<string, unknown> | null;
  const candidates = (root?.items ?? root?.menuItems ?? root?.elements ?? []) as Array<Record<string, unknown>>;
  return candidates.flatMap((item) => {
    const name = String(item.name ?? item.title ?? "").trim();
    if (!name) return [];
    const image = item.imageUrl ?? item.image_url ?? item.image;
    return [{ name, description: String(item.description ?? "") || undefined, imageUrl: typeof image === "string" ? image : undefined, source: provider === "google_business" ? "merchant" : provider.replace("_business", "") as MenuItemData["source"] }];
  });
}
