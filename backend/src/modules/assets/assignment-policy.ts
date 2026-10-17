export interface AssignableAssetState {
  status: string;
  assignedEmployeeId: string | null;
  currentLocationId: string | null;
}

export interface AssignableEmployeeState {
  isActive: boolean;
  homeLocationId: string | null;
}

export function canAssignAssetToEmployee(
  asset: AssignableAssetState,
  employee: AssignableEmployeeState,
): boolean {
  return asset.status === "AVAILABLE" &&
    asset.assignedEmployeeId === null &&
    asset.currentLocationId !== null &&
    employee.isActive &&
    employee.homeLocationId === asset.currentLocationId;
}

export function canReturnAssetToStock(asset: AssignableAssetState): boolean {
  return asset.status === "ASSIGNED" && asset.assignedEmployeeId !== null && asset.currentLocationId !== null;
}
