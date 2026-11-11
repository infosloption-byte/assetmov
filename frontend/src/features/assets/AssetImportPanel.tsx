import { useState, type ChangeEvent } from "react";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type RowData = { inventoryNumber: string; title: string; serialNumber: string; notes: string; currentLocationId: string };
type ImportRow = { index: number; data: RowData; problem: string; result: "ready" | "imported" | "failed"; detail: string };
type Props = {
  tenantId: string; csrfToken: string; allLocationsAccess: boolean;
  locations: Array<{id:string;name:string;code:string}>;
  onFinished: () => Promise<void>;
  onClose: () => void;
};

const keys: Array<keyof RowData> = ["inventoryNumber","title","serialNumber","notes","currentLocationId"];

/** RFC-style quoted CSV fields, including escaped quotes, CRLF and embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i=0; i<text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i+1] === '"') { value += '"'; i++; }
        else quoted = false;
      } else value += char;
    } else if (char === '"') {
      if (value.length > 0) throw new Error("Malformed CSV quote at character " + (i+1));
      quoted = true;
    } else if (char === ",") {
      row.push(value); value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i+1] === "\n") i++;
      row.push(value);
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted value.");
  row.push(value);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);
  return rows;
}

export default function AssetImportPanel({ tenantId, csrfToken, allLocationsAccess, locations, onFinished, onClose }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fallbackLocation, setFallbackLocation] = useState("");
  const [progress, setProgress] = useState(0);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    setError("");setRows([]);setProgress(0);
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 512*1024) {
      setError("CSV file must be smaller than 512 KiB."); return;
    }
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      const data = parseCsv(text);
      const head = data.shift()?.map(cell => cell.trim().replace(/^\uFEFF/,"")) ?? [];
      if (!head.includes("title") || head.some(h => !keys.includes(h as keyof RowData)) ||
          new Set(head).size !== head.length) {
        throw new Error("CSV headers must include title and only: " + keys.join(", "));
      }
      if (data.length > 100) throw new Error("This early import accepts at most 100 assets per file.");
      const seen = new Set<string>();
      const parsed = data.map((columns, index) => {
        const get = (key: keyof RowData) => String(columns[head.indexOf(key)] ?? "").trim();
        const row: RowData = {
          inventoryNumber: get("inventoryNumber"), title: get("title"),
          serialNumber: get("serialNumber"), notes: get("notes"), currentLocationId: get("currentLocationId"),
        };
        let problem = columns.length !== head.length ? "CSV column count differs from header." :
          !row.title ? "Missing asset title." : "";
        const key = row.inventoryNumber.toUpperCase();
        if (!problem && key && seen.has(key)) problem = "Duplicate inventory number in CSV.";
        if (key) seen.add(key);
        if (!problem && row.currentLocationId && !locations.some(l => l.id === row.currentLocationId)) {
          problem = "Location is not accessible in this workspace.";
        }
        return { index: index + 2, data: row, problem,
          result: "ready" as const, detail: "" };
      });
      if (parsed.length === 0) throw new Error("There are no asset rows in this file.");
      setRows(parsed);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not parse the CSV file.");
    }
  }

  async function importValidRows() {
    if (busy) return;
    const pending = rows.filter(row => row.result !== "imported" && !row.problem);
    if (!pending.length) return;
    setBusy(true);setError("");
    let finished = 0;
    try {
      for (const row of pending) {
        const currentLocationId = row.data.currentLocationId || fallbackLocation;
        if (!currentLocationId && !allLocationsAccess) {
          setRows(old => old.map(x => x.index === row.index ?
            { ...x, result:"failed" as const, detail:"Choose a location for this row." } : x));
          continue;
        }
        try {
          const response = await fetch(api + "/assets",{
            method:"POST",credentials:"include",
            headers:{"Content-Type":"application/json","X-Tenant-Id":tenantId,"X-CSRF-Token":csrfToken},
            body:JSON.stringify({ title:row.data.title, inventoryNumber:row.data.inventoryNumber,
              ...(row.data.serialNumber ? {serialNumber:row.data.serialNumber} : {}),
              ...(row.data.notes ? {notes:row.data.notes} : {}),
              ...(currentLocationId ? {currentLocationId} : {}) }),
          });
          const payload = await response.json().catch(()=>({})) as {error?:{message?:string}};
          if (!response.ok) throw new Error(payload.error?.message ?? "Server rejected this asset.");
          setRows(old => old.map(x => x.index === row.index ?
            { ...x, result:"imported" as const, detail:"Created" } : x));
        } catch (error) {
          setRows(old => old.map(x => x.index === row.index ?
            { ...x, result:"failed" as const, detail:error instanceof Error ? error.message : "Import failed." } : x));
        }
        finished++;
        setProgress(finished);
      }
      await onFinished();
    } finally { setBusy(false); }
  }

  const ready = rows.filter(row => row.result !== "imported" && !row.problem).length;
  return <div className="modal-backdrop" role="presentation">
    <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="assetImportTitle"
      style={{width:"min(96vw,1100px)",maxHeight:"90vh",overflow:"auto"}}>
      <div className="asset-modal-heading">
        <h2 id="assetImportTitle">Import asset register (CSV)</h2>
        <button type="button" className="modal-close" aria-label="Close import" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p className="asset-inline-hint">Up to 100 rows per import. Header: inventoryNumber,title,serialNumber,notes,currentLocationId. Leave inventoryNumber empty to auto-generate a unique number. Existing company access and quota rules apply.</p>
      <label>CSV file (.csv, 512 KiB maximum)
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event=>void pick(event)}/>
      </label>
      <label>Default location for rows without currentLocationId
        <select value={fallbackLocation} onChange={event=>setFallbackLocation(event.target.value)} disabled={busy}>
          <option value="">{allLocationsAccess ? "No location" : "Choose a location"}</option>
          {locations.map(l=><option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
        </select>
      </label>
      {error && <div className="asset-inline-error" role="alert">{error}</div>}
      {rows.length > 0 && <>
        <p role="status">{rows.length} rows reviewed. {ready} ready or retryable. {rows.filter(r=>r.result==="imported").length} imported. {progress} processed this run.</p>
        <div className="asset-table-wrap" style={{maxHeight:"48vh",overflow:"auto"}}>
          <table className="asset-table"><thead><tr><th>CSV row</th><th>Inventory number</th><th>Title</th><th>Location</th><th>Outcome</th></tr></thead>
            <tbody>{rows.map(row=><tr key={row.index}>
              <td>{row.index}</td><td>{row.data.inventoryNumber || "(automatic)"}</td>
              <td>{row.data.title}</td><td>{row.data.currentLocationId || fallbackLocation || "—"}</td>
              <td>{row.problem || (row.result === "ready" ? "Ready" : row.detail)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      <div className="asset-modal-actions">
        <button className="plain-button" type="button" disabled={busy} onClick={onClose}>Close</button>
        <button className="primary-button" type="button" disabled={busy || ready === 0} onClick={()=>void importValidRows()}>
          {busy ? "Importing…" : "Import " + ready + " ready assets"}
        </button>
      </div>
    </section>
  </div>;
}
