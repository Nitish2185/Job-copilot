import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/tailwind.css";
import { startTheme } from "@/lib/ui/theme";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Dashboard root element is missing");

startTheme();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
