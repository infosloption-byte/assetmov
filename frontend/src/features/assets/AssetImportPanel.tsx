import { useState, type ChangeEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";
import { readXlsxRows } from "./xlsx-reader";

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
    if (file.size > 2*1024*1024) {
      setError("The import file must be smaller than 2 MiB."); return;
    }
    try {
      if(!/\.(csv|xlsx)$/i.test(file.name)) throw new Error("Choose a .csv or .xlsx file.");
      const data = /\.xlsx$/i.test(file.name) ? await readXlsxRows(file) :
        parseCsv((await file.text()).replace(/^\uFEFF/, ""));
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
      // Reconcile explicit inventory numbers against this company's existing
      // register before the user starts importing. Final creation still checks.
      const response=await fetch(api+"/assets/import/preview",{
        method:"POST",credentials:"include",
        headers:{"X-Tenant-Id":tenantId,"X-CSRF-Token":csrfToken,"Content-Type":"application/json"},
        body:JSON.stringify({inventoryNumbers:parsed.map(row=>row.data.inventoryNumber)}),
      });
      if(!response.ok) throw new Error("Could not verify duplicates against this company's register.");
      const preview=await response.json() as {data:{issues:Array<{index:number;duplicate:boolean}>}};
      const duplicates=new Set(preview.data.issues.filter(item=>item.duplicate).map(item=>item.index));
      setRows(parsed.map((row,index)=>duplicates.has(index)
        ? {...row,problem:row.problem||"Inventory number already registered in this workspace."} : row));
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

  function downloadResults() {
    if(!rows.length)return;
    const escape=(value:string|number)=>'"'+String(value).replaceAll('"','""')+'"';
    const header=["row","inventoryNumber","title","serialNumber","location","result","details"];
    const content=[header.map(escape).join(","),
      ...rows.map(row=>[row.index,row.data.inventoryNumber,row.data.title,
        row.data.serialNumber,row.data.currentLocationId||fallbackLocation,row.result,
        row.problem||row.detail].map(escape).join(","))].join("\r\n");
    const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="assetmov-import-results.csv";
    document.body.appendChild(link);link.click();link.remove();
    URL.revokeObjectURL(url);
  }

  const ready = rows.filter(row => row.result !== "imported" && !row.problem).length;
  return <div className="modal-backdrop" role="presentation">
    <section className="asset-modal asset-import-panel" role="dialog" aria-modal="true" aria-labelledby="assetImportTitle"
      style={{width:"min(96vw,1100px)",maxHeight:"90vh",overflow:"auto"}}>
      <div className="asset-modal-heading">
        <h2 id="assetImportTitle">Import asset register (CSV / XLSX)</h2>
        <button type="button" className="modal-close" aria-label="Close import" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p className="asset-inline-hint">Import up to 100 records from CSV or the first sheet of an XLSX workbook.
        Required column: title. Optional: inventoryNumber, serialNumber, notes, currentLocationId.
        Leave inventoryNumber empty for automatic numbering. Duplicates are checked before import.</p>
      <label>CSV or XLSX file (2 MiB maximum)
        <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={event=>void pick(event)}/>
      </label>
      <div className="import-location-control">
        <label>Default location for rows without currentLocationId</label>
        <ThemeSelect label="Default CSV asset location" value={fallbackLocation}
          disabled={busy} onChange={setFallbackLocation}
          options={[{value:"",label:allLocationsAccess ? "No default location" : "Choose a location"},
            ...locations.map(location => ({value:location.id,label:location.name + " (" + location.code + ")"}))]}/>
      </div>
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
        {rows.length>0 && <button className="topbar-button ghost" type="button"
          disabled={busy} onClick={downloadResults}>Download row results CSV</button>}
        <button className="plain-button" type="button" disabled={busy} onClick={onClose}>Close</button>
        <button className="primary-button" type="button" disabled={busy || ready === 0} onClick={()=>void importValidRows()}>
          {busy ? "Importing…" : "Import " + ready + " ready assets"}
        </button>
      </div>
    </section>
  </div>;
}
