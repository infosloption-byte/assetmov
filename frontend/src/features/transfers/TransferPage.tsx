import { useCallback, useEffect, useState, type FormEvent } from "react";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

type TransferStatus = "IN_TRANSIT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "REJECTED" | "CANCELLED";
type TransferLineStatus = "IN_TRANSIT" | "RECEIVED" | "REJECTED";
type TransferDecision = "RECEIVED" | "REJECTED";

interface LocationItem {
  id: string;
  name: string;
  code: string;
}

interface AssetOption {
  id: string;
  inventoryNumber: string;
  assetNumber: string | null;
  serialNumber: string | null;
  title: string;
  status: string;
  currentLocationId: string | null;
}

interface TransferLine {
  id: string;
  status: TransferLineStatus;
  decisionReason: string | null;
  resolvedAt: string | null;
  resolvedBy: { id: string; fullName: string } | null;
  asset: {
    id: string;
    inventoryNumber: string;
    assetNumber: string | null;
    serialNumber: string | null;
    title: string;
    status: string;
    currentLocationId: string | null;
  };
}

interface TransferListItem {
  id: string;
  transferNumber: string;
  status: TransferStatus;
  notes: string | null;
  dispatchedAt: string;
  completedAt: string | null;
  createdAt: string;
  originLocation: LocationItem;
  destinationLocation: LocationItem;
  createdBy: { id: string; fullName: string };
  _count: { lines: number };
}

interface TransferDetail extends Omit<TransferListItem, "_count"> {
  lines: TransferLine[];
}

interface TransferPageProps {
  tenantId: string | null;
  csrfToken: string | null;
  permissions: string[];
  accessibleLocationIds: string[];
  manageableLocationIds: string[];
  allLocationsAccess: boolean;
}

interface ApiError {
  error?: { code?: string; message?: string };
}

function getApiError(payload: ApiError, fallback: string): string {
  return payload.error?.message ?? fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TransferPage({
  tenantId,
  csrfToken,
  permissions,
  accessibleLocationIds,
  manageableLocationIds,
  allLocationsAccess,
}: TransferPageProps) {
  const [direction, setDirection] = useState<"all" | "outgoing" | "incoming">("all");
  const [transfers, setTransfers] = useState<TransferListItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showDispatch, setShowDispatch] = useState(false);
  const [originLocationId, setOriginLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [eligibleAssets, setEligibleAssets] = useState<AssetOption[]>([]);
  const [eligibleAssetsLoading, setEligibleAssetsLoading] = useState(false);
  const [eligibleAssetsError, setEligibleAssetsError] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [dispatchError, setDispatchError] = useState("");
  const [dispatching, setDispatching] = useState(false);

  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [receiptSuccess, setReceiptSuccess] = useState("");
  const [decisions, setDecisions] = useState<Record<string, "" | TransferDecision>>({});
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  const canReadAssets = permissions.includes("asset.read");
  const canReadLocations = permissions.includes("location.read");
  const canDispatch = permissions.includes("asset.transfer.dispatch");
  const canReceive = permissions.includes("asset.transfer.receive");
  const canReadTransfers = permissions.some((permission) => [
    "asset.transfer.read",
    "asset.transfer.dispatch",
    "asset.transfer.receive",
  ].includes(permission));

  const originOptions = locations.filter((location) =>
    allLocationsAccess || manageableLocationIds.includes(location.id),
  );
  const destinationOptions = locations.filter((location) =>
    allLocationsAccess || accessibleLocationIds.includes(location.id),
  );
  const filteredEligibleAssets = eligibleAssets.filter((asset) => {
    const query = assetSearch.trim().toLowerCase();
    return !query || [
      asset.inventoryNumber,
      asset.assetNumber ?? "",
      asset.serialNumber ?? "",
      asset.title,
    ].some((value) => value.toLowerCase().includes(query));
  });

  const loadTransfers = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) {
      setTransfers([]);
      setLoading(false);
      setError("Select a workspace to view asset movements.");
      return;
    }
    if (!canReadTransfers) {
      setTransfers([]);
      setLoading(false);
      setError("Your role does not have permission to view transfers.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ direction, page: "1", pageSize: "25" });
      const response = await fetch(apiBaseUrl + "/transfers?" + params.toString(), {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
        signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: TransferListItem[];
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(getApiError(payload, "Could not load transfers."));
      setTransfers(payload.data ?? []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load transfers.");
      setTransfers([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tenantId, canReadTransfers, direction]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTransfers(controller.signal);
    return () => controller.abort();
  }, [loadTransfers]);

  useEffect(() => {
    if (!tenantId || !canReadLocations) {
      setLocations([]);
      setLocationsLoading(false);
      setLocationsError(canReadLocations ? "" : "Your role does not have permission to view locations.");
      return;
    }

    const selectedTenantId = tenantId;
    const controller = new AbortController();
    setLocationsLoading(true);
    async function loadLocationOptions() {
      try {
        const response = await fetch(apiBaseUrl + "/locations", {
          credentials: "include",
          headers: { "X-Tenant-Id": selectedTenantId },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as {
          data?: LocationItem[];
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(getApiError(payload, "Could not load locations."));
        setLocations(payload.data ?? []);
        setLocationsError("");
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setLocationsError(loadError instanceof Error ? loadError.message : "Could not load locations.");
      } finally {
        if (!controller.signal.aborted) setLocationsLoading(false);
      }
    }

    void loadLocationOptions();
    return () => controller.abort();
  }, [tenantId, canReadLocations]);

  useEffect(() => {
    if (!showDispatch || !tenantId || !originLocationId || !canReadAssets) {
      setEligibleAssets([]);
      setEligibleAssetsError("");
      setEligibleAssetsLoading(false);
      return;
    }

    const selectedTenantId = tenantId;
    const controller = new AbortController();
    setEligibleAssetsLoading(true);
    setEligibleAssetsError("");
    setSelectedAssetIds([]);

    async function loadEligibleAssets() {
      try {
        const params = new URLSearchParams({
          status: "AVAILABLE",
          locationId: originLocationId,
          page: "1",
          pageSize: "100",
        });
        const response = await fetch(apiBaseUrl + "/assets?" + params.toString(), {
          credentials: "include",
          headers: { "X-Tenant-Id": selectedTenantId },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as {
          data?: AssetOption[];
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(getApiError(payload, "Could not load available assets."));
        setEligibleAssets(payload.data ?? []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setEligibleAssets([]);
        setEligibleAssetsError(loadError instanceof Error ? loadError.message : "Could not load available assets.");
      } finally {
        if (!controller.signal.aborted) setEligibleAssetsLoading(false);
      }
    }

    void loadEligibleAssets();
    return () => controller.abort();
  }, [showDispatch, tenantId, originLocationId, canReadAssets]);

  function openDispatch() {
    setOriginLocationId(originOptions[0]?.id ?? "");
    setDestinationLocationId("");
    setEligibleAssets([]);
    setAssetSearch("");
    setSelectedAssetIds([]);
    setDispatchNotes("");
    setDispatchError("");
    setShowDispatch(true);
  }

  function toggleAsset(assetId: string, checked: boolean) {
    setSelectedAssetIds((current) => {
      if (checked) return current.includes(assetId) ? current : [...current, assetId];
      return current.filter((id) => id !== assetId);
    });
  }

  function toggleVisibleAssets(checked: boolean) {
    const visibleIds = filteredEligibleAssets.map((asset) => asset.id);
    setSelectedAssetIds((current) => {
      if (checked) return [...new Set([...current, ...visibleIds])].slice(0, 100);
      return current.filter((id) => !visibleIds.includes(id));
    });
  }

  async function dispatchTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || dispatching) return;
    if (!csrfToken) {
      setDispatchError("Your security token is missing. Sign in again and retry.");
      return;
    }
    if (!originLocationId || !destinationLocationId) {
      setDispatchError("Choose both an origin and destination location.");
      return;
    }
    if (originLocationId === destinationLocationId) {
      setDispatchError("Origin and destination must be different.");
      return;
    }
    if (selectedAssetIds.length === 0) {
      setDispatchError("Select at least one available asset to dispatch.");
      return;
    }

    setDispatching(true);
    setDispatchError("");
    setSuccess("");
    try {
      const response = await fetch(apiBaseUrl + "/transfers", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          originLocationId,
          destinationLocationId,
          assetIds: selectedAssetIds,
          notes: dispatchNotes.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: TransferDetail;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(getApiError(payload, "Could not dispatch transfer."));
      setShowDispatch(false);
      setSuccess(`Transfer ${payload.data.transferNumber} dispatched.`);
      await loadTransfers();
    } catch (dispatchLoadError) {
      setDispatchError(dispatchLoadError instanceof Error ? dispatchLoadError.message : "Could not dispatch transfer.");
    } finally {
      setDispatching(false);
    }
  }

  async function openTransfer(transferId: string) {
    if (!tenantId) return;
    setSelectedTransfer(null);
    setDetailError("");
    setReceiptError("");
    setReceiptSuccess("");
    setDetailLoading(true);

    try {
      const response = await fetch(apiBaseUrl + "/transfers/" + encodeURIComponent(transferId), {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: TransferDetail;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(getApiError(payload, "Could not load transfer details."));

      const transfer = payload.data;
      setSelectedTransfer(transfer);
      setDecisions(Object.fromEntries(transfer.lines.map((line) => [line.id, ""])) as Record<string, "" | TransferDecision>);
      setDecisionReasons(Object.fromEntries(transfer.lines.map((line) => [line.id, line.decisionReason ?? ""])));
    } catch (detailLoadError) {
      setDetailError(detailLoadError instanceof Error ? detailLoadError.message : "Could not load transfer details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !selectedTransfer || submittingReceipt) return;
    if (!csrfToken) {
      setReceiptError("Your security token is missing. Sign in again and retry.");
      return;
    }

    const pendingLines = selectedTransfer.lines.filter((line) => line.status === "IN_TRANSIT");
    const changes = pendingLines
      .filter((line) => decisions[line.id] === "RECEIVED" || decisions[line.id] === "REJECTED")
      .map((line) => ({
        lineId: line.id,
        decision: decisions[line.id] as TransferDecision,
        reason: decisionReasons[line.id]?.trim() || undefined,
      }));

    if (changes.length === 0) {
      setReceiptError("Choose Receive or Reject for at least one pending line.");
      return;
    }
    const missingReasons = changes.some((change) =>
      change.decision === "REJECTED" && (!change.reason || change.reason.length < 3),
    );
    if (missingReasons) {
      setReceiptError("Enter a rejection reason of at least 3 characters for each rejected asset.");
      return;
    }

    setSubmittingReceipt(true);
    setReceiptError("");
    setReceiptSuccess("");
    try {
      const response = await fetch(apiBaseUrl + "/transfers/" + encodeURIComponent(selectedTransfer.id) + "/receive", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ decisions: changes }),
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: TransferDetail;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(getApiError(payload, "Could not save transfer receipt decisions."));

      setSelectedTransfer(payload.data);
      setDecisions(Object.fromEntries(payload.data.lines.map((line) => [line.id, ""])) as Record<string, "" | TransferDecision>);
      setDecisionReasons(Object.fromEntries(payload.data.lines.map((line) => [line.id, line.decisionReason ?? ""])));
      setReceiptSuccess("Receipt decisions saved.");
      setSuccess(`Transfer ${payload.data.transferNumber} updated.`);
      await loadTransfers();
    } catch (receiptLoadError) {
      setReceiptError(receiptLoadError instanceof Error ? receiptLoadError.message : "Could not save receipt decisions.");
    } finally {
      setSubmittingReceipt(false);
    }
  }

  const currentPendingLines = selectedTransfer?.lines.filter((line) => line.status === "IN_TRANSIT") ?? [];
  const canReceiveSelected = Boolean(
    selectedTransfer &&
    canReceive &&
    (allLocationsAccess || accessibleLocationIds.includes(selectedTransfer.destinationLocation.id)) &&
    currentPendingLines.length > 0 &&
    ["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(selectedTransfer.status),
  );

  return (
    <section className="asset-register-page transfer-page">
      <div className="asset-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> MOVEMENT CONTROL</div>
          <h1 className="asset-page-title">Transfers & receipts</h1>
          <p>Dispatch available assets between locations, record receiving decisions, and keep each handover in the asset timeline.</p>
        </div>
        {canDispatch && (
          <button className="primary-button" type="button" onClick={openDispatch} disabled={locationsLoading || originOptions.length === 0}>
            {locationsLoading ? "Loading locations…" : "Dispatch assets"} {!locationsLoading && <span>＋</span>}
          </button>
        )}
      </div>

      <div className="transfer-summary-strip">
        <div><span>Listed transfers</span><strong>{transfers.length}</strong></div>
        <div><span>In transit</span><strong>{transfers.filter((item) => item.status === "IN_TRANSIT").length}</strong></div>
        <div><span>Partially received</span><strong>{transfers.filter((item) => item.status === "PARTIALLY_RECEIVED").length}</strong></div>
      </div>

      <div className="transfer-toolbar">
        <div className="transfer-tabs" role="tablist" aria-label="Transfer direction">
          {([
            ["all", "All visible"],
            ["outgoing", "Outgoing"],
            ["incoming", "Incoming"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={direction === value}
              className={direction === value ? "active" : ""}
              onClick={() => setDirection(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="topbar-button ghost" type="button" onClick={() => void loadTransfers()}>Refresh list ↻</button>
      </div>

      {success && <div className="asset-success" role="status">{success}</div>}
      {error && <div className="asset-inline-error" role="alert">{error}</div>}
      {locationsError && <div className="asset-inline-hint" role="status">{locationsError}</div>}

      <div className="asset-table-wrap">
        <table className="asset-table transfers-table">
          <thead><tr><th>Transfer</th><th>Origin</th><th>Destination</th><th>Assets</th><th>Dispatched</th><th>Status</th><th><span className="sr-only">View transfer</span></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="asset-table-message"><span className="table-loader" /> Loading transfers…</td></tr>
            ) : transfers.length === 0 ? (
              <tr><td colSpan={7} className="asset-table-message"><span className="empty-icon">⇄</span><strong>No transfers found</strong><span>Dispatch assets to a destination, or check the incoming queue for expected receipts.</span>{canDispatch && <button className="text-button" type="button" onClick={openDispatch}>Dispatch the first transfer ↗</button>}</td></tr>
            ) : transfers.map((transfer) => (
              <tr key={transfer.id}>
                <td><button className="asset-name-button" type="button" onClick={() => void openTransfer(transfer.id)}>{transfer.transferNumber}</button><span className="asset-number">By {transfer.createdBy.fullName}</span></td>
                <td>{transfer.originLocation.name}<span className="asset-number">{transfer.originLocation.code}</span></td>
                <td>{transfer.destinationLocation.name}<span className="asset-number">{transfer.destinationLocation.code}</span></td>
                <td>{transfer._count.lines}</td>
                <td>{formatDate(transfer.dispatchedAt)}</td>
                <td><span className={"asset-status-badge " + transfer.status.toLowerCase().replaceAll("_", "-")}>{titleCase(transfer.status)}</span></td>
                <td><button className="row-open-button" type="button" aria-label={"Open transfer " + transfer.transferNumber} onClick={() => void openTransfer(transfer.id)}>↗</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="asset-table-footer"><span>Only transfers within your tenant and location scope are shown.</span><span>Up to 25 transfers per view</span></div>

      {showDispatch && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDispatch(false); }}>
          <section className="asset-modal transfer-dispatch-modal" role="dialog" aria-modal="true" aria-labelledby="transferDispatchTitle">
            <div className="asset-modal-heading">
              <div><span className="module-tag">NEW MOVEMENT</span><h2 id="transferDispatchTitle">Dispatch assets</h2><p>Only available assets currently assigned to the chosen origin can be selected.</p></div>
              <button type="button" className="modal-close" aria-label="Close dispatch" onClick={() => setShowDispatch(false)}>×</button>
            </div>
            {(!canReadAssets || !canReadLocations) && <div className="asset-inline-error" role="alert">Your role needs asset-read and location-read access to prepare a transfer.</div>}
            <form className="asset-create-form" onSubmit={(event) => void dispatchTransfer(event)}>
              <div className="asset-form-two-col">
                <div>
                  <label htmlFor="transferOrigin">Origin location <span>*</span></label>
                  <select id="transferOrigin" value={originLocationId} onChange={(event) => setOriginLocationId(event.currentTarget.value)} required>
                    <option value="">Choose origin</option>
                    {originOptions.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="transferDestination">Destination location <span>*</span></label>
                  <select id="transferDestination" value={destinationLocationId} onChange={(event) => setDestinationLocationId(event.currentTarget.value)} required>
                    <option value="">Choose destination</option>
                    {destinationOptions.filter((location) => location.id !== originLocationId).map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                  </select>
                </div>
              </div>
              <div className="transfer-asset-picker">
                <div className="transfer-asset-picker-heading">
                  <div><strong>Available at origin</strong><span>{selectedAssetIds.length} selected · maximum 100</span></div>
                  <input aria-label="Search available assets" value={assetSearch} onChange={(event) => setAssetSearch(event.currentTarget.value)} placeholder="Search assets…" />
                </div>
                {eligibleAssetsLoading ? (
                  <div className="transfer-picker-message"><span className="table-loader" /> Loading available assets…</div>
                ) : eligibleAssetsError ? (
                  <div className="asset-inline-error" role="alert">{eligibleAssetsError}</div>
                ) : filteredEligibleAssets.length === 0 ? (
                  <div className="transfer-picker-message">No available assets at this origin. Only assets in AVAILABLE status can be dispatched.</div>
                ) : (
                  <>
                    <label className="transfer-select-all">
                      <input
                        type="checkbox"
                        checked={filteredEligibleAssets.length > 0 && filteredEligibleAssets.every((asset) => selectedAssetIds.includes(asset.id))}
                        onChange={(event) => toggleVisibleAssets(event.currentTarget.checked)}
                      />
                      Select all visible
                    </label>
                    <div className="transfer-asset-list">
                      {filteredEligibleAssets.map((asset) => (
                        <label key={asset.id} className="transfer-asset-option">
                          <input
                            type="checkbox"
                            checked={selectedAssetIds.includes(asset.id)}
                            onChange={(event) => toggleAsset(asset.id, event.currentTarget.checked)}
                            disabled={!selectedAssetIds.includes(asset.id) && selectedAssetIds.length >= 100}
                          />
                          <span><strong>{asset.title}</strong><small>{asset.inventoryNumber}{asset.serialNumber ? " · " + asset.serialNumber : ""}</small></span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <label htmlFor="transferNotes">Dispatch note</label>
              <textarea id="transferNotes" value={dispatchNotes} onChange={(event) => setDispatchNotes(event.currentTarget.value)} rows={2} maxLength={4000} placeholder="Optional transfer purpose or handover note" />
              {dispatchError && <div className="asset-inline-error" role="alert">{dispatchError}</div>}
              <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setShowDispatch(false)}>Cancel</button><button className="primary-button" type="submit" disabled={dispatching || !canReadAssets || !canReadLocations || eligibleAssetsLoading || selectedAssetIds.length === 0}>{dispatching ? "Dispatching…" : "Dispatch transfer"} {!dispatching && <span>↗</span>}</button></div>
            </form>
          </section>
        </div>
      )}

      {(detailLoading || selectedTransfer || detailError) && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedTransfer(null); setDetailError(""); setReceiptError(""); } }}>
          <section className="asset-modal transfer-detail-modal" role="dialog" aria-modal="true" aria-labelledby="transferDetailTitle">
            <div className="asset-modal-heading">
              <div><span className="module-tag">TRANSFER DETAILS</span><h2 id="transferDetailTitle">{selectedTransfer?.transferNumber ?? (detailLoading ? "Loading transfer…" : "Transfer details")}</h2>
                {selectedTransfer && <p>{selectedTransfer.originLocation.name} → {selectedTransfer.destinationLocation.name}</p>}
              </div>
              <button type="button" className="modal-close" aria-label="Close transfer details" onClick={() => { setSelectedTransfer(null); setDetailError(""); setReceiptError(""); }}>×</button>
            </div>
            {detailLoading && <div className="asset-table-message"><span className="table-loader" /> Loading transfer lines…</div>}
            {detailError && <div className="asset-inline-error" role="alert">{detailError}</div>}
            {selectedTransfer && (
              <>
                <div className="transfer-detail-meta">
                  <div><span>Origin</span><strong>{selectedTransfer.originLocation.name} ({selectedTransfer.originLocation.code})</strong></div>
                  <div><span>Destination</span><strong>{selectedTransfer.destinationLocation.name} ({selectedTransfer.destinationLocation.code})</strong></div>
                  <div><span>Dispatched</span><strong>{formatDate(selectedTransfer.dispatchedAt)}</strong></div>
                  <div><span>Created by</span><strong>{selectedTransfer.createdBy.fullName}</strong></div>
                  <div><span>Status</span><strong><span className={"asset-status-badge " + selectedTransfer.status.toLowerCase().replaceAll("_", "-")}>{titleCase(selectedTransfer.status)}</span></strong></div>
                  <div><span>Resolved</span><strong>{formatDate(selectedTransfer.completedAt)}</strong></div>
                </div>
                {selectedTransfer.notes && <p className="asset-detail-notes">{selectedTransfer.notes}</p>}

                {canReceiveSelected ? (
                  <form className="transfer-receipt-form" onSubmit={(event) => void submitReceipt(event)}>
                    <div className="asset-history-section"><h3>Receiving decisions</h3><p className="transfer-instruction">Accept each asset that arrived in good order. Rejecting an item records the reason and returns its custody/location to the origin in this workflow.</p>
                      {selectedTransfer.lines.map((line) => (
                        <div className={"transfer-line-card " + line.status.toLowerCase().replaceAll("_", "-")} key={line.id}>
                          <div className="transfer-line-asset"><strong>{line.asset.title}</strong><small>{line.asset.inventoryNumber}{line.asset.serialNumber ? " · " + line.asset.serialNumber : ""}</small></div>
                          <div className="transfer-line-status"><span className={"asset-status-badge " + line.status.toLowerCase().replaceAll("_", "-")}>{titleCase(line.status)}</span></div>
                          {line.status === "IN_TRANSIT" ? (
                            <>
                              <div className="transfer-decision-buttons">
                                <label className={decisions[line.id] === "RECEIVED" ? "selected receive" : ""}><input type="radio" name={"decision-" + line.id} checked={decisions[line.id] === "RECEIVED"} onChange={() => setDecisions((current) => ({ ...current, [line.id]: "RECEIVED" }))} /> Receive</label>
                                <label className={decisions[line.id] === "REJECTED" ? "selected reject" : ""}><input type="radio" name={"decision-" + line.id} checked={decisions[line.id] === "REJECTED"} onChange={() => setDecisions((current) => ({ ...current, [line.id]: "REJECTED" }))} /> Reject</label>
                              </div>
                              {decisions[line.id] === "REJECTED" && <input className="transfer-rejection-reason" value={decisionReasons[line.id] ?? ""} onChange={(event) => setDecisionReasons((current) => ({ ...current, [line.id]: event.currentTarget.value }))} minLength={3} maxLength={2000} placeholder="Required rejection reason" aria-label={"Rejection reason for " + line.asset.inventoryNumber} />}
                            </>
                          ) : (
                            <div className="transfer-line-resolution">
                              <span>{line.resolvedBy ? "Decision by " + line.resolvedBy.fullName : "Decision recorded"}</span>
                              {line.decisionReason && <small>{line.decisionReason}</small>}
                              {line.resolvedAt && <time>{formatDate(line.resolvedAt)}</time>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {receiptError && <div className="asset-inline-error" role="alert">{receiptError}</div>}
                    {receiptSuccess && <div className="asset-success" role="status">{receiptSuccess}</div>}
                    <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setSelectedTransfer(null)}>Close</button><button className="primary-button" type="submit" disabled={submittingReceipt || currentPendingLines.length === 0}>{submittingReceipt ? "Saving…" : "Save decisions"} {!submittingReceipt && <span>↗</span>}</button></div>
                  </form>
                ) : (
                  <>
                    <div className="asset-history-section"><h3>Transfer lines</h3>
                      <div className="transfer-readonly-lines">
                        {selectedTransfer.lines.map((line) => (
                          <div className="transfer-readonly-line" key={line.id}>
                            <span><strong>{line.asset.title}</strong><small>{line.asset.inventoryNumber}</small></span>
                            <span className={"asset-status-badge " + line.status.toLowerCase().replaceAll("_", "-")}>{titleCase(line.status)}</span>
                            {line.decisionReason && <p>{line.decisionReason}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {receiptError && <div className="asset-inline-error" role="alert">{receiptError}</div>}
                    <div className="asset-modal-actions"><button className="primary-button" type="button" onClick={() => setSelectedTransfer(null)}>Done</button></div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default TransferPage;
