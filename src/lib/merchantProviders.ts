import type { MenuItemData } from "./types";

export type MerchantProvider = "google_business" | "square" | "toast" | "clover" | "flipdish";

export const MERCHANT_PROVIDERS: Array<{ id: MerchantProvider; name: string; env: string[]; value: string }> = [
  { id: "google_business", name: "Google Business Profile", env: ["GOOGLE_BUSINESS_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_SECRET"], value: "Food menu and business updates" },
  { id: "square", name: "Square", env: ["SQUARE_APPLICATION_ID", "SQUARE_APPLICATION_SECRET"], value: "Catalog items, variations, and images" },
  { id: "toast", name: "Toast", env: ["TOAST_CLIENT_ID", "TOAST_CLIENT_SECRET"], value: "Menus, groups, items, and images" },
  { id: "clover", name: "Clover", env: ["CLOVER_APP_ID", "CLOVER_APP_SECRET"], value: "Inventory items, categories, and images" },
  { id: "flipdish", name: "Flipdish", env: ["FLIPDISH_CLIENT_ID", "FLIPDISH_CLIENT_SECRET"], value: "Menus, item availability, modifiers, and images" },
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
  const squareImages = new Map(
    ((root?.related_objects ?? root?.relatedObjects ?? []) as Array<Record<string, unknown>>)
      .flatMap((object) => {
        const data = object.image_data as Record<string, unknown> | undefined;
        return object.id && typeof data?.url === "string" ? [[String(object.id), data.url] as const] : [];
      })
  );
  const direct = (root?.items ?? root?.menuItems ?? root?.elements ?? []) as Array<Record<string, unknown>>;
  const square: Array<Record<string, unknown>> = ((root?.objects ?? []) as Array<Record<string, unknown>>).flatMap((object) => {
    if (object.type !== "ITEM" || !object.item_data) return [];
    const data = object.item_data as Record<string, unknown>;
    const imageId = Array.isArray(data.image_ids) ? data.image_ids[0] : undefined;
    return [{ ...data, imageUrl: imageId ? squareImages.get(String(imageId)) : undefined } as Record<string, unknown>];
  });
  const google = ((root?.menus ?? []) as Array<Record<string, unknown>>).flatMap((menu) =>
    ((menu.sections ?? []) as Array<Record<string, unknown>>).flatMap((section) =>
      (section.items ?? []) as Array<Record<string, unknown>>
    )
  );
  const flipdish = ((root?.MenuSections ?? root?.menuSections ?? []) as Array<Record<string, unknown>>).flatMap((section) =>
    (section.MenuItems ?? section.menuItems ?? []) as Array<Record<string, unknown>>
  );
  const candidates = [...direct, ...square, ...google, ...flipdish];
  const source: MenuItemData["source"] = provider === "google_business" ? "merchant" : provider;
  return candidates.flatMap((item) => {
    const name = String(item.name ?? item.Name ?? item.title ?? item.Title ?? "").trim();
    if (!name) return [];
    const image = item.imageUrl ?? item.ImageUrl ?? item.image_url ?? item.image;
    return [{
      name,
      description: String(item.description ?? item.Description ?? "") || undefined,
      imageUrl: typeof image === "string" ? image : undefined,
      source,
    }];
  });
}
