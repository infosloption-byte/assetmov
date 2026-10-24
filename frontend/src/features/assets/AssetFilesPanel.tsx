import { useCallback, useEffect, useState, type ChangeEvent } from "react";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type Attachment = { id: string; filename: string; mimeType: string; sizeBytes: number; createdAt: string };
type Props = { assetId: string; tenantId: string | null; csrfToken: string | null; canEdit: boolean };
const limit = 512 * 1024;
const allowed = ["image/jpeg","image/png","image/webp","application/pdf","text/plain"];
export default function AssetFilesPanel({ assetId, tenantId, csrfToken, canEdit }: Props) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const result = await fetch(api + "/files/assets/" + encodeURIComponent(assetId), {
        credentials: "include", headers: { "X-Tenant-Id": tenantId }, signal,
      });
      const data = await result.json() as { data?: Attachment[]; error?: { message: string } };
      if (!result.ok) throw new Error(data.error?.message ?? "Unable to load attachments.");
      if (!signal?.aborted) { setFiles(data.data ?? []); setError(""); }
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Attachments are unavailable.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [assetId,tenantId]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !tenantId) return;
    if (!csrfToken) { setError("Please sign in again before uploading."); return; }
    if (file.size > limit || file.size === 0 || !allowed.includes(file.type)) {
      setError("Choose a supported PDF, text or image file no larger than 512 KiB."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      const result = await fetch(api + "/files", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId, "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ assetId, filename: file.name, mimeType: file.type, contentBase64: base64 }),
      });
      const data = await result.json() as { error?: { message?: string; code?: string } };
      if (!result.ok) throw new Error(data.error?.message ?? data.error?.code ?? "Upload failed.");
      setNotice("Attachment uploaded. Storage usage has been updated.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload file."); }
    finally { setBusy(false); }
  }

  async function download(item: Attachment) {
    if (!tenantId) return;
    setError("");
    try {
      const response = await fetch(api + "/files/" + item.id + "/download", {
        credentials: "include", headers: { "X-Tenant-Id": tenantId },
      });
      if (!response.ok) throw new Error("Download denied or file unavailable.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = item.filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed."); }
  }

  async function remove(item: Attachment) {
    if (!tenantId || !csrfToken) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/files/" + item.id, {
        method: "DELETE", credentials: "include",
        headers: { "X-Tenant-Id": tenantId, "X-CSRF-Token": csrfToken },
      });
      if (!response.ok) throw new Error("Could not delete the attachment.");
      setPendingDelete(null); setNotice("Attachment deleted; storage capacity is released."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed."); }
    finally { setBusy(false); }
  }

  return <section className="asset-history-section" aria-label="Asset attachments">
    <h3>Attachments</h3>
    <p className="asset-inline-hint">PDF, text, PNG, JPEG and WebP. Maximum 512 KiB each. Files count against the company storage plan.</p>
    {canEdit && <label className="topbar-button ghost">Add attachment
      <input type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={e => void upload(e)} className="sr-only"/>
    </label>}
    {error && <p className="asset-inline-error" role="alert">{error}</p>}
    {notice && <p className="asset-success" role="status">{notice}</p>}
    {loading ? <p>Loading attachments…</p> : files.length === 0 ? <p>No attachments yet.</p> : <div className="account-sessions-list">
      {files.map(item => <div className="account-session" key={item.id}>
        <div><strong>{item.filename}</strong><small>{Math.ceil(item.sizeBytes / 1024)} KiB · {new Date(item.createdAt).toLocaleDateString()}</small></div>
        <button type="button" className="topbar-button ghost" onClick={() => void download(item)}>Download</button>
        {canEdit && <button type="button" className="topbar-button ghost" onClick={() => setPendingDelete(item)}>Delete</button>}
      </div>)}
    </div>}
    {pendingDelete && <div className="asset-inline-hint" role="alertdialog" aria-label="Confirm attachment removal">
      <strong>Delete {pendingDelete.filename}?</strong>
      <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setPendingDelete(null)}>Cancel</button>
        <button className="primary-button" disabled={busy} type="button" onClick={() => void remove(pendingDelete)}>Delete attachment</button></div>
    </div>}
  </section>;
}
