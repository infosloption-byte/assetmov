import { useState, type FormEvent } from "react";
import type { AuthMode, AuthUser } from "./types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api")
  .replace(/\/$/, "");

interface AuthPageProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onCancel: () => void;
  onAuthenticated: (user: AuthUser, csrfToken: string) => void;
}

interface AuthResponse {
  user?: AuthUser;
  csrfToken?: string;
  error?: { code?: string; message?: string };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function AuthPage({ mode, onModeChange, onCancel, onAuthenticated }: AuthPageProps) {
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage("");

    try {
      const body = mode === "register"
        ? { tenantName, tenantSlug, fullName, email, password }
        : { email, password };

      const response = await fetch(
        `${apiBaseUrl}/auth/${mode === "register" ? "register" : "login"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const result = await response.json().catch(() => ({})) as AuthResponse;
      if (!response.ok || !result.user || !result.csrfToken) {
        throw new Error(result.error?.message ?? "We could not complete that request. Check your connection and try again.");
      }

      onAuthenticated(result.user, result.csrfToken);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <a className="brand auth-brand" href="/" aria-label="AssetMov home" onClick={(event) => { event.preventDefault(); onCancel(); }}>
          <span className="brand-mark">A<span>.</span></span>
          <span className="brand-copy"><strong>assetmov</strong><small>ASSET LIFECYCLE</small></span>
        </a>

        <div className="auth-brand-message">
          <div className="eyebrow"><span className="eyebrow-line" /> ASSET OPERATIONS, MADE CLEAR</div>
          <h1>Everything has a place.<br /><em>Now every asset does, too.</em></h1>
          <p>Bring inventory, people, locations and handovers into one dependable workspace.</p>
          <div className="auth-mini-flow" aria-label="Asset lifecycle: register, move, maintain, report">
            <span><b>01</b> Register</span><i>→</i><span><b>02</b> Move</span><i>→</i><span><b>03</b> Maintain</span><i>→</i><span><b>04</b> Report</span>
          </div>
        </div>

        <div className="auth-panel-footer">Thoughtful tracking, from acquisition to retirement.</div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-top"><span>ASSETMOV WORKSPACE</span><button className="plain-button" type="button" onClick={onCancel}>Back to preview</button></div>
        <div className="auth-form-content">
          <div className="auth-form-eyebrow">{isRegister ? "GET STARTED" : "WELCOME BACK"}</div>
          <h2>{isRegister ? "Create your workspace" : "Sign in to AssetMov"}</h2>
          <p className="auth-form-lead">{isRegister ? "Set up your organization and invite your team when you’re ready." : "Enter your account details to continue to your workspace."}</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {isRegister && (
              <>
                <label htmlFor="tenantName">Organization name</label>
                <input
                  id="tenantName"
                  name="tenantName"
                  autoComplete="organization"
                  value={tenantName}
                  onChange={(event) => {
                    const nextName = event.currentTarget.value;
                    setTenantName(nextName);
                    if (!slugEdited) setTenantSlug(slugify(nextName));
                  }}
                  placeholder="e.g. Northstar Services"
                  minLength={2}
                  maxLength={120}
                  required
                />

                <label htmlFor="tenantSlug">Workspace URL name</label>
                <div className="slug-input-wrap">
                  <span>assetmov /</span>
                  <input
                    id="tenantSlug"
                    name="tenantSlug"
                    autoComplete="off"
                    value={tenantSlug}
                    onChange={(event) => {
                      setSlugEdited(true);
                      setTenantSlug(slugify(event.currentTarget.value));
                    }}
                    placeholder="northstar"
                    minLength={3}
                    maxLength={63}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    required
                  />
                </div>

                <label htmlFor="fullName">Your full name</label>
                <input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.currentTarget.value)}
                  placeholder="Full name"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </>
            )}

            <label htmlFor="email">Work email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@organization.com"
              maxLength={191}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder={isRegister ? "At least 12 characters" : "Your password"}
              minLength={isRegister ? 12 : 1}
              maxLength={128}
              required
            />

            {errorMessage && <div className="auth-error" role="alert">{errorMessage}</div>}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Please wait…" : isRegister ? "Create workspace" : "Sign in"}
              {!submitting && <span>↗</span>}
            </button>
          </form>

          {!isRegister && <p className="auth-small-note"><a href="/?accountAction=forgot">Forgot your password?</a></p>}
          <div className="auth-mode-switch">
            {isRegister ? "Already have an account?" : "New to AssetMov?"}
            <button type="button" onClick={() => onModeChange(isRegister ? "login" : "register")}>
              {isRegister ? "Sign in" : "Create a workspace"}
            </button>
          </div>

          {isRegister && <p className="auth-small-note">By creating a workspace, you’ll become its first organization owner. Use the Verify email action after registration to secure your account.</p>}
        </div>
        <div className="auth-mobile-footer">© {new Date().getFullYear()} AssetMov</div>
      </section>
    </main>
  );
}

export default AuthPage;
