import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/tailwind.css";
import { startTheme } from "@/lib/ui/theme";
import { Popup } from "./Popup";

const container = document.getElementById("root");
if (!container) throw new Error("Popup root element is missing");

startTheme();

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
