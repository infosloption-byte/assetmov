import { useCallback, useEffect, useState, type FormEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type Kind = "ASSET" | "SOFTWARE" | "SERVICE";
type Item = {itemType: Kind; description:string; quantity:number; notes:string};
type RequestRow = {
  id:string; requestType:Kind; status:string; businessReason:string;
  requestedBy:{id:string;fullName:string}; decidedBy?:{fullName:string}|null;
  decisionReason?:string|null; createdAt:string; items:Array<Item & {id:string}>;
};
type Props = {
  tenantId:string|null; csrfToken:string|null; permissions:string[];
  currentUserId:string|null;
};
const kindOptions: Array<{value:Kind;label:string}> = [
  {value:"ASSET",label:"Asset"},{value:"SOFTWARE",label:"Software"},
  {value:"SERVICE",label:"Service"},
];
const emptyItem = (type:Kind):Item=>({itemType:type,description:"",quantity:1,notes:""});

export default function RequestsPage({tenantId,csrfToken,permissions,currentUserId}:Props){
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [open,setOpen]=useState(false);
  const [kind,setKind]=useState<Kind>("ASSET");
  const [items,setItems]=useState<Item[]>([emptyItem("ASSET")]);
  const [decision,setDecision]=useState<{record:RequestRow;status:"APPROVED"|"REJECTED"|"CHANGES_REQUESTED"}|null>(null);
  const canSubmit=permissions.includes("request.create");
  const canApprove=permissions.includes("request.approve");

  const load=useCallback(async()=>{
    if(!tenantId || (!canSubmit && !canApprove)) {setRows([]);setLoading(false);return;}
    setLoading(true);setError("");
    try{
      const response=await fetch(api+"/requests",{
        credentials:"include",headers:{"X-Tenant-Id":tenantId},
      });
      const payload=await response.json().catch(()=>({})) as {
        data?:RequestRow[];error?:{message?:string}
      };
      if(!response.ok)throw new Error(payload.error?.message??"Could not load requests.");
      setRows(payload.data??[]);
    }catch(error){setError(error instanceof Error?error.message:"Could not load requests.");}
    finally{setLoading(false);}
  },[tenantId,canSubmit,canApprove]);
  useEffect(()=>{void load();},[load]);

  async function post(path:string,body:unknown){
    if(!tenantId || !csrfToken)throw new Error("Your session security token has expired.");
    const response=await fetch(api+"/requests"+path,{
      method:"POST",credentials:"include",
      headers:{"X-Tenant-Id":tenantId,"X-CSRF-Token":csrfToken,"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({})) as {error?:{message?:string}};
    if(!response.ok)throw new Error(payload.error?.message??"Request action failed.");
  }

  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving)return;
    const data=new FormData(event.currentTarget);
    setSaving(true);setError("");setSuccess("");
    try{
      await post("",{
        requestType:kind,businessReason:String(data.get("businessReason")??"").trim(),
        items:items.map(item=>({...item,description:item.description.trim(),
          notes:item.notes.trim()||undefined})),
      });
      setOpen(false);setItems([emptyItem("ASSET")]);setKind("ASSET");
      setSuccess("Request submitted for review.");await load();
    }catch(error){setError(error instanceof Error?error.message:"Could not submit request.");}
    finally{setSaving(false);}
  }
  async function decide(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!decision||saving)return;
    const data=new FormData(event.currentTarget);
    setSaving(true);setError("");setSuccess("");
    try{
      await post("/"+decision.record.id+"/decision",{
        decision:decision.status,reason:String(data.get("reason")??"").trim(),
      });
      setDecision(null);setSuccess("Decision recorded in the audit history.");await load();
    }catch(error){setError(error instanceof Error?error.message:"Decision could not be saved.");}
    finally{setSaving(false);}
  }
  async function cancel(record:RequestRow){
    if(saving)return;
    setSaving(true);setError("");setSuccess("");
    try{await post("/"+record.id+"/cancel",{});setSuccess("Request cancelled.");await load();}
    catch(error){setError(error instanceof Error?error.message:"Cancellation failed.");}
    finally{setSaving(false);}
  }

  return <section className="asset-register-page">
    <div className="asset-page-heading">
      <div><div className="eyebrow"><span className="eyebrow-line"/> WORKFLOW</div>
        <h1 className="asset-page-title">Requests & approvals</h1>
        <p>Submit asset, software or service requests and track each review decision.</p></div>
      <div className="asset-heading-actions">
        <button type="button" className="topbar-button ghost" onClick={()=>void load()}>Refresh</button>
        {canSubmit && <button type="button" className="primary-button" onClick={()=>{
          setKind("ASSET");setItems([emptyItem("ASSET")]);setOpen(true);setError("");
        }}>New request +</button>}
      </div>
    </div>
    {success && <div role="status" className="asset-success">{success}</div>}
    {error && <div role="alert" className="asset-inline-error">{error}</div>}
    <div className="asset-table-wrap" tabIndex={0} aria-label="Requests table, scroll horizontally to view columns">
      <table className="asset-table">
        <thead><tr><th>Submitted</th><th>Requested by</th><th>Type</th>
          <th>Items</th><th>Status</th><th>Decision</th><th>Actions</th></tr></thead>
        <tbody>
          {loading?<tr><td colSpan={7}>Loading requests…</td></tr>:
           rows.length===0?<tr><td colSpan={7} className="asset-table-message">
              <strong>No requests yet</strong><span>Submitted requests appear here for review.</span>
            </td></tr>:rows.map(record=><tr key={record.id}>
              <td>{new Date(record.createdAt).toLocaleDateString()}</td>
              <td>{record.requestedBy.fullName}</td>
              <td>{record.requestType}</td>
              <td>{record.items.map(item=>item.description+" × "+item.quantity).join("; ")}</td>
              <td><span className="module-tag">{record.status.replaceAll("_"," ")}</span></td>
              <td>{record.decisionReason??"—"}</td>
              <td><div className="master-section-actions">
                {canApprove && record.requestedBy.id!==currentUserId &&
                  ["PENDING","CHANGES_REQUESTED"].includes(record.status) && <>
                    <button className="topbar-button ghost" type="button" onClick={()=>setDecision({record,status:"APPROVED"})}>Approve</button>
                    <button className="topbar-button ghost" type="button" onClick={()=>setDecision({record,status:"REJECTED"})}>Reject</button>
                    <button className="topbar-button ghost" type="button" onClick={()=>setDecision({record,status:"CHANGES_REQUESTED"})}>Request changes</button>
                  </>}
                {canSubmit && record.requestedBy.id===currentUserId &&
                  ["PENDING","CHANGES_REQUESTED"].includes(record.status) &&
                  <button className="topbar-button ghost" type="button"
                    disabled={saving} onClick={()=>void cancel(record)}>Cancel</button>}
              </div></td>
            </tr>)}
        </tbody>
      </table>
    </div>

    {open && <div className="modal-backdrop"><section className="asset-modal" role="dialog"
      aria-modal="true" aria-labelledby="newRequestTitle">
      <div className="asset-modal-heading"><h2 id="newRequestTitle">New request</h2>
        <button type="button" className="modal-close" aria-label="Close" onClick={()=>setOpen(false)}>×</button></div>
      <form className="asset-create-form" onSubmit={event=>void create(event)}>
        <label>Request type</label>
        <ThemeSelect label="Request type" value={kind} onChange={value=>{
          const next=value as Kind;setKind(next);setItems([emptyItem(next)]);
        }} options={kindOptions}/>
        <label>Business reason<textarea name="businessReason" required minLength={8} maxLength={2000}
          rows={3} placeholder="Explain the business need and expected use"/></label>
        <strong>Requested items</strong>
        {items.map((item,index)=><div key={index} className="asset-custody-panel">
          <label>Item description<input required minLength={5} maxLength={500}
            value={item.description} placeholder="e.g. Laptop for new employee"
            onChange={event=>setItems(old=>old.map((v,i)=>i===index?{...v,description:event.target.value}:v))}/></label>
          <label>Quantity<input type="number" required min={1} max={100}
            value={item.quantity} onChange={event=>setItems(old=>old.map((v,i)=>i===index?
              {...v,quantity:Number(event.target.value)}:v))}/></label>
          <label>Notes<input maxLength={2000} value={item.notes} placeholder="Optional specifications"
            onChange={event=>setItems(old=>old.map((v,i)=>i===index?{...v,notes:event.target.value}:v))}/></label>
          {items.length>1 && <button type="button" className="plain-button"
            onClick={()=>setItems(old=>old.filter((_,i)=>i!==index))}>Remove item</button>}
        </div>)}
        <button className="topbar-button ghost" type="button" disabled={items.length>=30}
          onClick={()=>setItems(old=>[...old,emptyItem(kind)])}>Add another item</button>
        <div className="asset-modal-actions">
          <button className="plain-button" type="button" onClick={()=>setOpen(false)}>Cancel</button>
          <button className="primary-button" type="submit" disabled={saving}>Submit request</button>
        </div>
      </form>
    </section></div>}
    {decision && <div className="modal-backdrop"><section className="asset-modal" role="dialog"
      aria-modal="true" aria-labelledby="requestDecisionTitle">
      <div className="asset-modal-heading">
        <h2 id="requestDecisionTitle">{decision.status.replaceAll("_"," ").toLowerCase()} request</h2>
        <button type="button" className="modal-close" aria-label="Close"
          onClick={()=>setDecision(null)}>×</button>
      </div>
      <p className="asset-inline-hint">Reviewing {decision.record.requestedBy.fullName}'s request.
        A reason is mandatory and the decision will be audited.</p>
      <form className="asset-create-form" onSubmit={event=>void decide(event)}>
        <label>Decision reason<textarea name="reason" minLength={8} maxLength={2000}
          rows={3} placeholder="Describe your approval or reason for rejection" required/></label>
        <div className="asset-modal-actions">
          <button className="plain-button" type="button" onClick={()=>setDecision(null)}>Cancel</button>
          <button className="primary-button" type="submit" disabled={saving}>Confirm decision</button>
        </div>
      </form>
    </section></div>}
  </section>;
}
