export function mealEmojiForLocalHour(hour: number): "🥞" | "🍔" | "🍲" {
  const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24;
  if (normalizedHour >= 5 && normalizedHour < 11) return "🥞";
  if (normalizedHour >= 11 && normalizedHour < 17) return "🍔";
  return "🍲";
}
