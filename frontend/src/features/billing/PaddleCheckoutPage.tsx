import { useEffect, useState } from "react";
import "./billing.css";
type PaddleInstance = {
  Environment: { set: (mode: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback?: (event: { name: string }) => void }) => void;
  Checkout: { open: (options: { transactionId: string; settings?: { successUrl: string } }) => void };
};
type PaddleWindow = Window & { Paddle?: PaddleInstance };
const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;

/** Paddle owns the payment form. The signed server webhook owns entitlements. */
export default function PaddleCheckoutPage() {
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const transactionId = params.get("_ptxn") ?? "";
  useEffect(() => {
    if (!/^txn_[a-z\d]{26}$/.test(transactionId)) {
      setError("The secure checkout link is missing a valid Paddle transaction."); return;
    }
    if (!token) { setError("Paddle sandbox checkout is not configured on this website."); return; }
    let canceled = false;
    let script: HTMLScriptElement | null = null;
    const open = () => {
      if (canceled) return;
      try {
        const paddle = (window as PaddleWindow).Paddle;
        if (!paddle) throw new Error("Paddle.js unavailable");
        paddle.Environment.set("sandbox");
        paddle.Initialize({ token: token!, eventCallback: event => {
          if (event.name === "checkout.completed") {
            window.location.assign("/?billing=pending");
          }
        } });
        paddle.Checkout.open({
          transactionId,
          settings: { successUrl: window.location.origin + "/?billing=pending" },
        });
        setOpened(true);
      } catch { setError("The Paddle checkout could not be opened. Please retry from Billing & Plan."); }
    };
    if ((window as PaddleWindow).Paddle) open();
    else {
      script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.dataset.assetmovPaddle = "true";
      script.onload = open;
      script.onerror = () => { if (!canceled) setError("Unable to load the secure Paddle checkout."); };
      document.head.appendChild(script);
    }
    return () => { canceled = true; if (script) script.remove(); };
  }, [transactionId]);
  return <main className="billing-checkout"><section className="billing-checkout-inner">
    <span className="brand-mark" aria-label="AssetMov">A<span>.</span></span>
    <h1>Secure AssetMov checkout</h1>
    {error ? <p className="asset-inline-error" role="alert">{error}</p>
      : <p role="status">{opened ? "Paddle's secure checkout is open." : "Opening Paddle Sandbox checkout…"}</p>}
    <p>Payment details are handled securely by Paddle. A successful checkout screen does not activate company access; AssetMov waits for a verified Paddle event.</p>
    <a href="/?billing=pending" className="primary-button">Return to AssetMov</a>
  </section></main>;
}
