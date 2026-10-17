export const assetStatuses = [
  "DRAFT",
  "AVAILABLE",
  "ASSIGNED",
  "IN_TRANSIT",
  "IN_SERVICE",
  "DAMAGED",
  "DISPOSED",
  "RETIRED",
] as const;

export type AssetStatus = (typeof assetStatuses)[number];

const allowedTransitions: Record<AssetStatus, ReadonlySet<AssetStatus>> = {
  DRAFT: new Set(["AVAILABLE", "RETIRED"]),
  AVAILABLE: new Set([
    "ASSIGNED",
    "IN_TRANSIT",
    "IN_SERVICE",
    "DAMAGED",
    "DISPOSED",
    "RETIRED",
  ]),
  ASSIGNED: new Set([
    "AVAILABLE",
    "IN_TRANSIT",
    "IN_SERVICE",
    "DAMAGED",
  ]),
  IN_TRANSIT: new Set(["AVAILABLE", "ASSIGNED", "DAMAGED"]),
  IN_SERVICE: new Set(["AVAILABLE", "DAMAGED"]),
  DAMAGED: new Set(["AVAILABLE", "IN_SERVICE", "DISPOSED", "RETIRED"]),
  DISPOSED: new Set(),
  RETIRED: new Set(),
};

export class InvalidAssetTransitionError extends Error {
  constructor(from: AssetStatus, to: AssetStatus) {
    super(`Asset status cannot change from ${from} to ${to}.`);
    this.name = "InvalidAssetTransitionError";
  }
}

export function canTransitionAsset(
  from: AssetStatus,
  to: AssetStatus,
): boolean {
  return from === to || allowedTransitions[from].has(to);
}

export function assertAssetTransition(
  from: AssetStatus,
  to: AssetStatus,
): void {
  if (!canTransitionAsset(from, to)) {
    throw new InvalidAssetTransitionError(from, to);
  }
}

export function assertAssetAssignable(status: AssetStatus): void {
  if (status !== "AVAILABLE") {
    throw new Error(`Only AVAILABLE assets may be assigned; current status is ${status}.`);
  }
}

export function assertAssetTransferable(status: AssetStatus): void {
  if (status !== "AVAILABLE" && status !== "ASSIGNED") {
    throw new Error(`Assets in ${status} status cannot be transferred.`);
  }
}

export function assertAssetDisposable(status: AssetStatus): void {
  if (status !== "AVAILABLE" && status !== "DAMAGED") {
    throw new Error(`Assets in ${status} status cannot be disposed.`);
  }
}
