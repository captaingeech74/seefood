export interface HookupPromotion {
  id: string;
  title: string;
  offer: string;
  audienceSize: number;
  recipientMode: "single" | "group";
  recipientLabel: string;
  message: string;
  expiresAt: string;
  createdAt: string;
  redeemedBy: string[];
}

export interface MemberHookup {
  id: string;
  promotionId: string;
  restaurantName: string;
  title: string;
  offer: string;
  expiresAt: string;
  status: "ready" | "used";
  code: string;
  forFriends: boolean;
  demo: boolean;
  message: string;
  recipientLabel: string;
}

const PROMOTIONS_KEY = "seefood-demo-promotions";
const HOOKUPS_KEY = "seefood-demo-hookups";

const futureDate = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

export function samplePromotions(): HookupPromotion[] {
  return [{
    id: "welcome-back-table",
    title: "Bring Your Table Back",
    offer: "20% off for you and up to 3 friends",
    audienceSize: 25,
    recipientMode: "group",
    recipientLabel: "Top 25 supporters",
    message: "You have shown our kitchen a lot of love. Bring some friends and let us return the favor.",
    expiresAt: futureDate(21),
    createdAt: new Date().toISOString(),
    redeemedBy: ["Maya R.", "Chris T.", "Jordan K."],
  }];
}

export function sampleHookups(): MemberHookup[] {
  return [{
    id: "hookup-welcome-back",
    promotionId: "welcome-back-table",
    restaurantName: "LRay's Kitchen",
    title: "Demo: A hookup for your table",
    offer: "20% off for you and up to 3 friends",
    expiresAt: futureDate(21),
    status: "ready",
    code: "https://seefood.app/h/hookup-welcome-back",
    forFriends: true,
    demo: true,
    message: "You have shown our kitchen a lot of love. Bring some friends and let us return the favor.",
    recipientLabel: "Top supporters",
  }];
}

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function getPromotions(): HookupPromotion[] {
  return read(PROMOTIONS_KEY, samplePromotions()).map((item) => ({
    ...item,
    recipientMode: item.recipientMode ?? "group",
    recipientLabel: item.recipientLabel ?? `Top ${item.audienceSize} supporters`,
    message: item.message ?? "",
  }));
}

export function getMemberHookups(): MemberHookup[] {
  return read<MemberHookup[]>(HOOKUPS_KEY, sampleHookups()).map((item) => ({
    ...item,
    demo: item.demo ?? true,
    message: item.message ?? "",
    recipientLabel: item.recipientLabel ?? "Top supporters",
  }));
}

export function createPromotion(input: {
  title: string;
  offer: string;
  audienceSize: number;
  recipientMode: "single" | "group";
  recipientLabel: string;
  message: string;
  expiresAt: string;
}): HookupPromotion {
  const promotion: HookupPromotion = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    redeemedBy: [],
  };
  localStorage.setItem(PROMOTIONS_KEY, JSON.stringify([promotion, ...getPromotions()]));
  const coupon: MemberHookup = {
    id: `hookup-${promotion.id}`,
    promotionId: promotion.id,
    restaurantName: "LRay's Kitchen",
    title: promotion.title,
    offer: promotion.offer,
    expiresAt: promotion.expiresAt,
    status: "ready",
    code: `https://seefood.app/h/hookup-${promotion.id}`,
    forFriends: true,
    demo: true,
    message: promotion.message,
    recipientLabel: promotion.recipientLabel,
  };
  localStorage.setItem(HOOKUPS_KEY, JSON.stringify([coupon, ...getMemberHookups()]));
  return promotion;
}

export function redeemHookup(code: string): MemberHookup | null {
  const id = code.trim().split("/").pop()?.replace(/^seefood:hookup:/, "");
  if (!id) return null;
  const hookups = getMemberHookups();
  const match = hookups.find((item) => item.id === id);
  if (!match) return null;
  const updated = hookups.map((item) => item.id === id ? { ...item, status: "used" as const } : item);
  localStorage.setItem(HOOKUPS_KEY, JSON.stringify(updated));
  const promotions = getPromotions().map((promotion) => promotion.id === match.promotionId
    ? { ...promotion, redeemedBy: [...new Set([...promotion.redeemedBy, "Current member"])] }
    : promotion);
  localStorage.setItem(PROMOTIONS_KEY, JSON.stringify(promotions));
  return { ...match, status: "used" };
}
