import { DataSource } from "@/lib/types";

/** Human-readable label for each photo/menu data source (shared by the
 *  Reveal source tag and the grid's unnamed-photo fallback caption). */
export const SOURCE_LABELS: Record<DataSource, string> = {
  google: "Google", doordash: "DoorDash", grubhub: "Grubhub", menufy: "Menufy",
  schema_org: "Restaurant", toast: "Toast", square: "Square", clover: "Clover",
  chownow: "ChowNow", olo: "Olo", popmenu: "PopMenu", menu_ocr: "Menu", merchant: "Management",
  bentobox: "BentoBox", owner: "Owner", spothopper: "SpotHopper", slice: "Slice",
  flipdish: "Flipdish", lightspeed: "Lightspeed", gloriafood: "GloriaFood", common_crawl: "Restaurant archive",
  user_upload: "SeeFood",
  user_suggested: "SeeFood",
};

/**
 * Display-format a stored address without touching the stored value:
 * - drops a leading component that is only a street number (some records
 *   are missing their street name — "42200, Temecula, CA 92591, USA"
 *   should read "Temecula, CA 92591", not lead with a dangling number)
 * - drops a trailing ", USA" (every restaurant here is domestic; the
 *   country label is noise on a phone-width line)
 */
export function formatAddress(address: string | undefined | null): string {
  if (!address) return "";
  let parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^\d+$/.test(parts[0])) parts = parts.slice(1);
  if (parts.length > 1 && /^(usa|united states)$/i.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  return parts.join(", ");
}
