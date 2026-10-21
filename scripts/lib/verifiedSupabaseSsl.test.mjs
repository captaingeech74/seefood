import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { test } from "vitest";
import { verifiedSupabaseSsl } from "./verifiedSupabaseSsl.mjs";

const sample = "postgresql://postgres:secret@aws-1-us-east-2.pooler.supabase.com:6543/postgres";

test("uses the expected Supabase root and requires certificate verification", () => {
  const ssl = verifiedSupabaseSsl(sample);
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(
    new X509Certificate(ssl.ca).fingerprint256,
    "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
  );
});

test("fails closed for another host or pg SSL URL overrides", () => {
  assert.throws(() => verifiedSupabaseSsl(sample.replace(".supabase.com", ".example.com")));
  for (const option of ["sslmode=require", "sslrootcert=%2Ftmp%2Fother.pem", "sslcert=%2Ftmp%2Fclient.pem", "sslkey=%2Ftmp%2Fclient.key"]) {
    assert.throws(() => verifiedSupabaseSsl(`${sample}?${option}`));
  }
  assert.throws(() => verifiedSupabaseSsl(""));
});
