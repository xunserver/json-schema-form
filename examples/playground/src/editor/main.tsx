import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlaygroundApp } from "./playground-app";
import "./index.css";

const root = document.getElementById("app");
if (root === null) {
  throw new Error("#app missing");
}

createRoot(root).render(
  <StrictMode>
    <PlaygroundApp />
  </StrictMode>,
);
