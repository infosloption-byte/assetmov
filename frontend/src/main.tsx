import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PaddleCheckoutPage from "./features/billing/PaddleCheckoutPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/checkout" ? <PaddleCheckoutPage /> : <App />}
  </React.StrictMode>,
);
