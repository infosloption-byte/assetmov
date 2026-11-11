import { useEffect, useState, type FormEvent } from "react";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

export default function AccountRecoveryPage() {
  const [action] = useState(() => {
    const mode = new URLSearchParams(window.location.search).get("accountAction");
    return mode === "verify" || mode === "reset" ? mode : "forgot";
  });
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Remove one-time token from the visible address/history after capturing it.
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const body: Record<string,string> = action === "forgot" ?
      { email: String(data.get("email") ?? "").trim() } :
      action === "reset" ?
        { token, newPassword: String(data.get("password") ?? "") } : { token };

    if (action === "reset") {
      if (body.newPassword.length < 12) {
        setError("Choose a password of at least 12 characters."); return;
      }
      if (body.newPassword !== String(data.get("confirmation") ?? "")) {
        setError("Passwords do not match."); return;
      }
    }
    setBusy(true);setError("");setMessage("");
    const route = action === "forgot" ? "/auth/password/forgot" :
      action === "reset" ? "/auth/password/reset" : "/auth/email/verification/confirm";
    try {
      const response = await fetch(api + route, {
        method:"POST", credentials:"include", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      const result = await response.json().catch(()=>({})) as {message?:string;error?:{message?:string}};
      if (!response.ok) throw new Error(result.error?.message ?? "Could not finish this request.");
      setMessage(result.message ?? "Success.");
    } catch (error) { setError(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(false); }
  }

  const title = action === "reset" ? "Set a new password" :
    action === "verify" ? "Verify your email" : "Recover your account";
  return <main className="auth-screen">
    <section className="auth-brand-panel">
      <a className="brand auth-brand" href="/" aria-label="AssetMov home">
        <span className="brand-mark">A<span>.</span></span>
        <span className="brand-copy"><strong>assetmov</strong><small>ASSET LIFECYCLE</small></span>
      </a>
      <div className="auth-brand-message"><div className="eyebrow"><span className="eyebrow-line"/> ACCOUNT SECURITY</div>
        <h1>Secure access.<br/><em>Clear recovery.</em></h1>
        <p>Keep your organization's asset data protected with verified accounts and one-time recovery links.</p>
      </div>
    </section>
    <section className="auth-form-panel">
      <div className="auth-form-top"><span>ASSETMOV ACCOUNT</span><a href="/">Return to AssetMov</a></div>
      <div className="auth-form-content">
        <div className="auth-form-eyebrow">ACCOUNT SECURITY</div>
        <h2>{title}</h2>
        <p className="auth-form-lead">{action === "forgot" ?
          "Enter your email address. If an account exists, we will send a one-time recovery link." :
          action === "verify" ? "Confirm the email address associated with your AssetMov account." :
          "Set a new password. This will revoke all existing account sessions."}</p>
        {!token && action !== "forgot" && <div className="auth-error" role="alert">Missing recovery token. Please request a new link.</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {message && <div className="asset-success" role="status">{message}</div>}
        {!message && (action === "forgot" || token) && <form className="auth-form" onSubmit={event=>void submit(event)}>
          {action === "forgot" && <>
            <label htmlFor="recoveryEmail">Account email</label>
            <input id="recoveryEmail" name="email" type="email" autoComplete="email" maxLength={191} required/>
          </>}
          {action === "reset" && <>
            <label htmlFor="recoveryPassword">New password</label>
            <input id="recoveryPassword" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/>
            <label htmlFor="recoveryConfirmation">Confirm password</label>
            <input id="recoveryConfirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/>
          </>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : action === "reset" ? "Reset password" :
              action === "verify" ? "Verify email" : "Send recovery email"}
          </button>
        </form>}
        <p className="auth-small-note"><a href="/">Return to sign in</a></p>
      </div>
    </section>
  </main>;
}
