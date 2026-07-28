import { createHash } from "node:crypto";

export const WINDOWS = [
  { key: "allTime", days: null },
  { key: "days90", days: 90 },
  { key: "days30", days: 30 },
  { key: "days7", days: 7 },
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function opaqueId(seed, kind, value) {
  if (value === null || value === undefined || value === "") return null;
  return `${kind}_${sha256(`${seed}|${kind}|${value}`).slice(0, 24)}`;
}

export function inWindow(timestamp, snapshot, days) {
  if (!timestamp) return false;
  const time = new Date(timestamp).getTime();
  const end = new Date(snapshot).getTime();
  return time <= end && (days === null || time >= end - days * 86_400_000);
}

export function aggregateWindow(events, photos, snapshot, days) {
  const windowEvents = events.filter((row) =>
    inWindow(row.createdAt, snapshot, days)
  );
  const windowPhotos = photos.filter((row) =>
    inWindow(row.createdAt, snapshot, days)
  );
  const appOpens = windowEvents.filter((row) => row.eventName === "app_open");
  const uploadEvents = windowEvents.filter((row) => row.eventName === "photo_add");
  const activeContributionPhotos = windowPhotos.filter(
    (row) =>
      row.evaluationEligibleEntity &&
      row.active &&
      row.moderationStatus === "approved"
  );
  const excludedFixturePhotos = windowPhotos.filter(
    (row) => !row.evaluationEligibleEntity
  );
  const nonNull = (value) => value !== null && value !== undefined && value !== "";
  const distinct = (rows, field) =>
    new Set(rows.map((row) => row[field]).filter(nonNull)).size;

  return {
    visits: appOpens.length,
    uniqueVisitors: distinct(appOpens, "opaqueVisitorId"),
    sessions: distinct(windowEvents, "opaqueSessionId"),
    uploadSessions: distinct(uploadEvents, "opaqueSessionId"),
    successfulUploads: activeContributionPhotos.length,
    successfulUploadEvents: uploadEvents.length,
    excludedTestFixtureContributionRecords: excludedFixturePhotos.length,
    uniqueContributors: distinct(activeContributionPhotos, "opaqueContributorId"),
    dishDetailUploads: uploadEvents.filter(
      (row) => row.photoAddSurface === "dish_detail"
    ).length,
    missingDishUploads: uploadEvents.filter(
      (row) => row.photoAddSurface === "missing_dish"
    ).length,
    attachedUploads: activeContributionPhotos.filter(
      (row) => row.attachedToCurrentMenu
    ).length,
    comparisonReadyContributions: activeContributionPhotos.filter(
      (row) => row.currentMechanicalComparisonReady
    ).length,
    uniqueRestaurantsImproved: distinct(
      activeContributionPhotos.filter((row) => row.attachedToCurrentMenu),
      "opaqueEntityId"
    ),
  };
}

export function scanText(text, secretValues) {
  const findings = [];
  if (
    secretValues.some(
      (secret) => typeof secret === "string" && secret.length >= 8 && text.includes(secret)
    )
  ) {
    findings.push("loaded_environment_secret_value");
  }
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text)) {
    findings.push("email_address");
  }
  if (/postgres(?:ql)?:\/\//i.test(text)) findings.push("connection_string");
  if (/\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/.test(text)) {
    findings.push("token_pattern");
  }
  return findings;
}
