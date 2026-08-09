function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let differences = 0;
    for (let index = 0; index < a.length; index++) {
      if (a[index] !== b[index] && ++differences > 1) return false;
    }
    return true;
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let skipped = false;
  for (let left = 0, right = 0; left < shorter.length && right < longer.length;) {
    if (shorter[left] === longer[right]) { left++; right++; continue; }
    if (skipped) return false;
    skipped = true;
    right++;
  }
  return true;
}

export function restaurantSearchTerms(value: string): string[] {
  const raw = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const terms: string[] = [];
  for (let index = 0; index < raw.length; index++) {
    if (/^[a-z]$/.test(raw[index]) && /^[a-z]/.test(raw[index + 1] ?? "")) {
      terms.push(`${raw[index]}${raw[index + 1]}`);
      index++;
    } else terms.push(raw[index]);
  }
  return terms;
}

export function restaurantSearchMatches(query: string, value: string): boolean {
  const wanted = restaurantSearchTerms(query);
  if (!wanted.length) return true;
  const available = restaurantSearchTerms(value);
  return wanted.every((term) => available.some((candidate) =>
    candidate.includes(term) ||
    (term.length >= 5 && candidate.length >= 5 && withinOneEdit(term, candidate))
  ));
}
