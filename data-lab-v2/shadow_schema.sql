PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS load_runs (
    run_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_release TEXT,
    selected_sample TEXT NOT NULL,
    record_count INTEGER NOT NULL CHECK (record_count >= 0)
);

CREATE TABLE IF NOT EXISTS entities (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL DEFAULT 'restaurant',
    created_at TEXT NOT NULL,
    review_state TEXT NOT NULL DEFAULT 'unreviewed'
        CHECK (review_state IN ('unreviewed', 'accepted', 'rejected', 'quarantined'))
);

CREATE TABLE IF NOT EXISTS source_records (
    source_name TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    entity_id TEXT REFERENCES entities(entity_id),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    source_release TEXT,
    source_record_version TEXT,
    raw_fingerprint TEXT,
    PRIMARY KEY (source_name, source_record_id)
);

CREATE TABLE IF NOT EXISTS observations (
    observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_value TEXT NOT NULL,
    confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    license_id TEXT,
    FOREIGN KEY (source_name, source_record_id)
        REFERENCES source_records(source_name, source_record_id)
        ON DELETE CASCADE,
    UNIQUE (source_name, source_record_id, observed_at, field_name, field_value)
);

CREATE TABLE IF NOT EXISTS record_locations (
    source_name TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    precision_meters REAL,
    PRIMARY KEY (source_name, source_record_id, observed_at),
    FOREIGN KEY (source_name, source_record_id)
        REFERENCES source_records(source_name, source_record_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS identity_decisions (
    decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
    left_source TEXT NOT NULL,
    left_record_id TEXT NOT NULL,
    right_source TEXT NOT NULL,
    right_record_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('match', 'no_match', 'review')),
    method TEXT NOT NULL,
    score REAL CHECK (score IS NULL OR score BETWEEN 0 AND 1),
    distance_meters REAL,
    decided_at TEXT NOT NULL,
    UNIQUE (left_source, left_record_id, right_source, right_record_id, method),
    FOREIGN KEY (left_source, left_record_id)
        REFERENCES source_records(source_name, source_record_id),
    FOREIGN KEY (right_source, right_record_id)
        REFERENCES source_records(source_name, source_record_id)
);

CREATE INDEX IF NOT EXISTS observations_field_idx
    ON observations(field_name, field_value);
CREATE INDEX IF NOT EXISTS source_records_entity_idx
    ON source_records(entity_id);
