import { DishPhoto, Restaurant } from "./types";

/**
 * PRD §4.3/§4.4 — auto-composed dish card (photo + dish name + restaurant +
 * SeeFood mark) via the native share sheet. Tries to compose a real image
 * card via canvas first (richest result); canvas can fail on cross-origin
 * photos that don't send CORS headers (most non-Google sources are hotlinked
 * directly from their CDN), so this always falls back gracefully rather than
 * ever blocking the share — text+link share, then clipboard, then alert.
 */
export async function shareDish(photo: DishPhoto, restaurant: Restaurant): Promise<void> {
  const shareUrl = restaurant.slug
    ? `${window.location.origin}/r/${restaurant.slug}`
    : window.location.href;
  const title = photo.dishName ? `${photo.dishName} at ${restaurant.name}` : restaurant.name;
  const text = photo.dishName
    ? `${photo.dishName} at ${restaurant.name} — seen on SeeFood`
    : `Check out ${restaurant.name} on SeeFood`;

  const file = await composeShareCard(photo, restaurant).catch(() => null);

  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return;
    } catch {
      // user cancelled or share failed — fall through to text share
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: shareUrl });
      return;
    } catch {
      // fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(`${text} ${shareUrl}`);
    alert("Link copied to clipboard!");
  } catch {
    alert(shareUrl);
  }
}

async function composeShareCard(photo: DishPhoto, restaurant: Restaurant): Promise<File | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const loaded = new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
  });
  img.src = photo.url;
  if (!(await loaded)) return null;

  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Cover-fit the photo into the top ~85% of the card.
  const photoH = Math.round(H * 0.85);
  const scale = Math.max(W / img.width, photoH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (W - dw) / 2, (photoH - dh) / 2, dw, dh);

  // Bottom gradient + text card, matching the app's dark/orange design language.
  const grad = ctx.createLinearGradient(0, photoH - 220, 0, H);
  grad.addColorStop(0, "rgba(10,10,10,0)");
  grad.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, photoH - 220, W, H - (photoH - 220));
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, photoH, W, H - photoH);

  ctx.fillStyle = "#fafafa";
  ctx.font = "bold 52px -apple-system, sans-serif";
  ctx.fillText(truncateToWidth(ctx, photo.dishName ?? restaurant.name, W - 80), 40, H - 130);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 32px -apple-system, sans-serif";
  ctx.fillText(truncateToWidth(ctx, restaurant.name, W - 80), 40, H - 80);

  ctx.fillStyle = "#ff6b35";
  ctx.font = "bold 28px -apple-system, sans-serif";
  ctx.fillText("SEEFOOD", 40, H - 35);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return null;
  return new File([blob], "dish.jpg", { type: "image/jpeg" });
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}
