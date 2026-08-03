export interface IdentityCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
}

export interface IncomingIdentity {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
}

export interface IdentityEvidence {
  candidateId: string;
  distanceMeters: number;
  nameSimilarity: number;
  distinctiveNameOverlap: boolean;
  domainEqual: boolean;
  phoneEqual: boolean;
  addressEqual: boolean;
  score: number;
  eligible: boolean;
  reasonCodes: string[];
}

export type IdentityResolution =
  | { disposition: "new"; evidence: null; alternatives: IdentityEvidence[] }
  | { disposition: "match"; evidence: IdentityEvidence; alternatives: IdentityEvidence[] }
  | { disposition: "quarantine"; evidence: IdentityEvidence; alternatives: IdentityEvidence[] };

const GENERIC_NAME_TOKENS = new Set([
  "and", "bar", "cafe", "company", "grill", "kitchen", "restaurant", "the",
]);

const STREET_REPLACEMENTS: Record<string, string> = {
  avenue: "ave", boulevard: "blvd", court: "ct", drive: "dr", east: "e",
  highway: "hwy", lane: "ln", north: "n", parkway: "pkwy", road: "rd",
  south: "s", street: "st", west: "w",
};

export function normalizeIdentityText(value = ""): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeDomain(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function normalizePhone(value?: string | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function normalizeStreetAddress(value?: string | null): string | null {
  const normalized = normalizeIdentityText(value ?? "");
  if (!normalized) return null;
  return normalized.split(" ").map((token) => STREET_REPLACEMENTS[token] ?? token).join(" ");
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bigrams(value: string): Set<string> {
  const compact = ` ${value.replace(/\s+/g, " ")} `;
  return new Set(Array.from({ length: Math.max(0, compact.length - 1) }, (_, index) => compact.slice(index, index + 2)));
}

export function nameSimilarity(left?: string | null, right?: string | null): number {
  const a = normalizeIdentityText(left ?? "");
  const b = normalizeIdentityText(right ?? "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  const one = bigrams(a);
  const two = bigrams(b);
  const overlap = [...one].filter((token) => two.has(token)).length;
  return (2 * overlap) / Math.max(1, one.size + two.size);
}

function distinctiveOverlap(left: string, right: string): boolean {
  const a = new Set(normalizeIdentityText(left).split(" ").filter((token) => token.length > 1 && !GENERIC_NAME_TOKENS.has(token)));
  const b = new Set(normalizeIdentityText(right).split(" ").filter((token) => token.length > 1 && !GENERIC_NAME_TOKENS.has(token)));
  return [...a].some((token) => b.has(token));
}

export function identityEvidence(incoming: IncomingIdentity, candidate: IdentityCandidate): IdentityEvidence {
  const meters = distanceMeters(incoming, candidate);
  const similarity = nameSimilarity(incoming.name, candidate.name);
  const overlap = distinctiveOverlap(incoming.name, candidate.name);
  const leftDomain = normalizeDomain(incoming.website);
  const rightDomain = normalizeDomain(candidate.website);
  const leftPhone = normalizePhone(incoming.phone);
  const rightPhone = normalizePhone(candidate.phone);
  const leftAddress = normalizeStreetAddress(incoming.address);
  const rightAddress = normalizeStreetAddress(candidate.address);
  const domainEqual = Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
  const phoneEqual = Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
  const addressEqual = Boolean(leftAddress && rightAddress && leftAddress === rightAddress);
  const eligible = meters <= 150 && (meters <= 50 || addressEqual) && (
    (domainEqual && (similarity >= 0.35 || overlap))
    || (phoneEqual && (similarity >= 0.55 || overlap))
    || (addressEqual && (similarity >= 0.60 || overlap))
  );
  const reasonCodes = [
    domainEqual && "domain_equal",
    phoneEqual && "phone_equal",
    addressEqual && "address_equal",
    overlap && "distinctive_name_overlap",
    similarity >= 0.85 && "strong_name_similarity",
    meters <= 50 && "within_50m",
  ].filter((value): value is string => Boolean(value));
  const score = 5 * Number(domainEqual) + 5 * Number(phoneEqual) + 3 * Number(addressEqual)
    + 2 * similarity + Number(overlap) - Math.min(meters, 150) / 300;
  return {
    candidateId: candidate.id,
    distanceMeters: Number(meters.toFixed(1)),
    nameSimilarity: Number(similarity.toFixed(4)),
    distinctiveNameOverlap: overlap,
    domainEqual,
    phoneEqual,
    addressEqual,
    score: Number(score.toFixed(4)),
    eligible,
    reasonCodes,
  };
}

export function resolveIdentity(incoming: IncomingIdentity, candidates: IdentityCandidate[]): IdentityResolution {
  const ranked = candidates.map((candidate) => identityEvidence(incoming, candidate))
    .filter((row) => row.distanceMeters <= 150)
    .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId));
  const eligible = ranked.filter((row) => row.eligible);
  if (!eligible.length) return { disposition: "new", evidence: null, alternatives: ranked.slice(0, 5) };
  if (eligible.length > 1 && eligible[0].score - eligible[1].score < 1) {
    return { disposition: "quarantine", evidence: eligible[0], alternatives: eligible.slice(0, 5) };
  }
  return { disposition: "match", evidence: eligible[0], alternatives: ranked.slice(0, 5) };
}

