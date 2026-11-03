import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/tailwind.css";
import { startTheme } from "@/lib/ui/theme";
import { SidePanel } from "./SidePanel";

const container = document.getElementById("root");
if (!container) throw new Error("Side panel root element is missing");

startTheme();

createRoot(container).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
