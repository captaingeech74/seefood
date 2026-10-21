import { readFileSync } from "node:fs";

// Public Supabase Root 2021 CA, downloaded from Supabase's published certificate
// endpoint. SHA-256 fingerprint: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:
// 00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA.
const supabaseRoot = readFileSync(new URL("./certs/supabase-root-2021.pem", import.meta.url), "utf8");

/**
 * Authenticate the Supabase Postgres server, including its hostname. pg's
 * connection-string parser replaces `ssl` if the URL has SSL query options,
 * so reject those rather than silently losing this verification policy.
 *
 * @param {string | undefined} [connectionString]
 */
export function verifiedSupabaseSsl(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required for verified database TLS");
  const url = new URL(connectionString);
  if (!url.hostname.endsWith(".supabase.com") && !url.hostname.endsWith(".supabase.co")) {
    throw new Error("Verified Supabase TLS requires a Supabase database hostname");
  }
  for (const key of url.searchParams.keys()) {
    if (["sslmode", "sslcert", "sslkey", "sslrootcert"].includes(key.toLowerCase())) {
      throw new Error("Remove SSL query options from DATABASE_URL; they override verified TLS settings in pg");
    }
  }
  return { rejectUnauthorized: true, ca: supabaseRoot };
}
