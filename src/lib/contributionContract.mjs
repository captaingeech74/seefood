function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

/**
 * The one fail-closed adapter between the database-owned contribution
 * contract and application/runtime code. The read-only DataLab exporter
 * imports this exact function so parity covers interpretation, not merely
 * two aliases of one SQL value.
 */
export function interpretContributionGoldContract(value) {
  const contract = objectOrEmpty(value);
  const behavioral = objectOrEmpty(contract.behavioral);
  const gates = objectOrEmpty(behavioral.gates);
  const targetEvidence = {
    activeRestaurant: gates.activeRestaurant === true,
    activeEntity: gates.activeEntity === true,
    operatingStatusNotClosed: gates.operatingStatusNotClosed === true,
    activeMenuItem: gates.activeMenuItem === true,
    zeroMissingStreak: gates.zeroMissingStreak === true,
    observedWithin30Days: gates.observedWithin30Days === true,
    latestSuccessfulSourceSnapshot:
      gates.latestSuccessfulSourceSnapshot === true,
  };
  const behavioralPromptCandidate = behavioral.eligible === true;

  return {
    behavioralPromptCandidate,
    goldComparisonCandidate:
      behavioralPromptCandidate && contract.eligible === true,
    selectedManagementPhotoId:
      contract.selectedPhotoId == null ? null : contract.selectedPhotoId,
    targetEvidence,
  };
}

/**
 * Only an acknowledged upload receipt keeps an attempt reusable for
 * idempotent replay. Every local failure or non-OK/malformed response retires
 * the cached attempt so a retry receives a new UUID.
 */
export function shouldRetireContributionAttempt({
  responseOk,
  hasReceipt,
  localFailure = false,
}) {
  return localFailure || responseOk !== true || hasReceipt !== true;
}
