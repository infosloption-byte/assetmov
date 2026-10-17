export type TransferLineResolutionStatus = "IN_TRANSIT" | "RECEIVED" | "REJECTED";
export type TransferResolutionStatus = "IN_TRANSIT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "REJECTED";

export function summarizeTransferStatus(
  lineStatuses: readonly TransferLineResolutionStatus[],
): TransferResolutionStatus {
  if (lineStatuses.length === 0) {
    throw new Error("A transfer must contain at least one asset line.");
  }

  if (lineStatuses.every((status) => status === "RECEIVED")) return "RECEIVED";
  if (lineStatuses.every((status) => status === "REJECTED")) return "REJECTED";
  if (lineStatuses.some((status) => status !== "IN_TRANSIT")) return "PARTIALLY_RECEIVED";
  return "IN_TRANSIT";
}

export function areAllTransferLinesResolved(
  lineStatuses: readonly TransferLineResolutionStatus[],
): boolean {
  return lineStatuses.length > 0 && lineStatuses.every((status) => status !== "IN_TRANSIT");
}
