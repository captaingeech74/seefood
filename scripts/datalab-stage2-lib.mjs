import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function publicProviderIds(cohortRow) {
  return Object.entries(cohortRow.providerIds || {}).flatMap(([provider, ids]) =>
    (ids || []).map((providerId) => ({ provider, providerId }))
  );
}

function distance(left, right) {
  if (
    left.lat == null ||
    left.lng == null ||
    right.latitude == null ||
    right.longitude == null
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.hypot(left.lat - right.latitude, left.lng - right.longitude);
}

export function buildCohortPreferences(cohort, identityRows) {
  const identitiesByPublicId = new Map();
  for (const identity of identityRows) {
    const rows = identitiesByPublicId.get(identity.provider_id) || [];
    rows.push(identity);
    identitiesByPublicId.set(identity.provider_id, rows);
  }

  return cohort.map((cohortRow) => {
    const candidates = new Map();
    for (const { provider, providerId } of publicProviderIds(cohortRow)) {
      for (const identity of identitiesByPublicId.get(providerId) || []) {
        const current = candidates.get(identity.entity_id) || {
          entityId: identity.entity_id,
          lat: identity.lat,
          lng: identity.lng,
          matchCount: 0,
          seefoodMatch: false,
        };
        current.matchCount += 1;
        current.seefoodMatch ||= provider === "seefood";
        candidates.set(identity.entity_id, current);
      }
    }
    return [...candidates.values()]
      .sort(
        (left, right) =>
          Number(right.seefoodMatch) - Number(left.seefoodMatch) ||
          right.matchCount - left.matchCount ||
          distance(left, cohortRow) - distance(right, cohortRow) ||
          left.entityId.localeCompare(right.entityId)
      )
      .map((candidate) => candidate.entityId);
  });
}

export function maximumUniqueEntityAssignment(preferences) {
  const ownerByEntity = new Map();

  function augment(cohortIndex, visited) {
    for (const entityId of preferences[cohortIndex]) {
      if (visited.has(entityId)) continue;
      visited.add(entityId);
      const currentOwner = ownerByEntity.get(entityId);
      if (
        currentOwner == null ||
        augment(currentOwner, visited)
      ) {
        ownerByEntity.set(entityId, cohortIndex);
        return true;
      }
    }
    return false;
  }

  const order = [...preferences.keys()].sort(
    (left, right) =>
      preferences[left].length - preferences[right].length || left - right
  );
  for (const cohortIndex of order) augment(cohortIndex, new Set());

  const entityByCohortIndex = Array(preferences.length).fill(null);
  for (const [entityId, cohortIndex] of ownerByEntity) {
    entityByCohortIndex[cohortIndex] = entityId;
  }
  return entityByCohortIndex;
}

export function metricFlags(metric = {}) {
  metric ||= {};
  const menuCount = Number(metric.menu_count || 0);
  const photoCount = Number(metric.photo_count || 0);
  const matchedPhotoCount = Number(metric.matched_photo_count || 0);
  const matchedDishCount = Number(metric.matched_dish_count || 0);
  const comparisonDishCount = Number(metric.comparison_dish_count || 0);
  return {
    menuCoverage: menuCount >= 1,
    basicPhotoCoverage: photoCount >= 7,
    basicMenuPhotoCoverage: matchedPhotoCount >= 7,
    twentyPercentMenuPhotoCoverage:
      menuCount > 0 &&
      matchedPhotoCount >= 7 &&
      matchedDishCount >= Math.ceil(menuCount * 0.2),
    fiftyPercentMenuPhotoCoverage:
      menuCount > 0 &&
      matchedPhotoCount >= 7 &&
      matchedDishCount >= Math.ceil(menuCount * 0.5),
    comparisonCoverage: comparisonDishCount >= 1,
  };
}

export function aggregateCoverage(records) {
  const result = {
    identifiedRestaurants: records.length,
    menuCoverage: 0,
    basicPhotoCoverage: 0,
    basicMenuPhotoCoverage: 0,
    twentyPercentMenuPhotoCoverage: 0,
    fiftyPercentMenuPhotoCoverage: 0,
    comparisonCoverage: 0,
  };
  for (const record of records) {
    const flags = metricFlags(record);
    for (const [key, value] of Object.entries(flags)) {
      if (value) result[key] += 1;
    }
  }
  return result;
}

export function stableSampleRank(namespace, stableId) {
  return sha256(`${namespace}|${stableId}`);
}
