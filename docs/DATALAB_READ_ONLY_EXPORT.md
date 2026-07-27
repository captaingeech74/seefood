# DataLab read-only evidence exports

DataLab never receives production credentials. When an experiment needs
production evidence, the main SeeFood thread creates a bounded, sanitized,
local bundle and places a copy in the lab's ignored `data-lab/raw/` directory.
The lab evaluates that evidence offline.

## DL-001 baseline calibration

Run from the normal `main` checkout:

```sh
npm run export:datalab:dl001 -- --mirror "/absolute/path/to/the/datalab/worktree/data-lab/raw/baseline/DL-001"
```

The exporter:

- refuses to overwrite an existing completed bundle;
- uses one direct PostgreSQL transaction opened as repeatable-read and read-only;
- verifies the database's read-only setting before querying evidence;
- executes no mutation, RPC, application route, cache operation, or storage
  write;
- samples by the fixed DL-001 hash rules and stops above 10 photos per
  restaurant or 120 photos total;
- fetches only the selected image bytes through direct bounded reads;
- creates metadata-stripped 512-pixel WebP evidence renders;
- removes raw URLs, credentials, contributor/customer identifiers and content,
  device/session data, payment data, and precise personal timestamps;
- secret-scans the staged output against the loaded production environment;
- creates a SHA-256 manifest and a separate blind Guardian packet; and
- makes both completed copies filesystem read-only.

The generated bundle is ignored by Git. It includes the exact SQL, transaction
proof, schema fingerprint, all candidates in the bounded calibration rectangle,
separate recomputed and stored comparison signals, selected menu/photo evidence,
the redaction record, and the blind Guardian packet.

The rectangle is deliberately labeled as a calibration bound rather than a
Temecula census. DL-001 is meant to calibrate the benchmark. A later census must
use the geographic definition in the DataLab benchmark specification.

If any selected claimed-dish image is inaccessible, a bucket has fewer than
four candidates, the photo bounds would be exceeded, a secret is detected, or
the database does not confirm read-only mode, the exporter fails before
publishing a completed bundle.

The first run exercised that stop condition: an Epic Wings candidate was a
restaurant webpage previously proven to be a non-image, but a later transient
fetch failure had made it active again. The main thread repaired the responsible
ingestion rule, re-quarantined only rows already carrying durable rejection
evidence, and then regenerated the bundle. The final bundle has 183 candidates,
12 selected restaurants, 980 menu rows, and 82 photo records. It records
complete inclusion of every photo on each selected comparison dish.
