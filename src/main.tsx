import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Selector from "./Selector";
import "./index.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

function Root() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const window = getCurrentWindow();
    setLabel(window.label);
  }, []);

  // Prevent rendering anything until we know which window we are
  if (label === null) {
    return null;
  }

  // Detect selector window by label or by URL query param (fallback for Windows)
  const params = new URLSearchParams(window.location.search);
  const isSelector = label === "selector" || params.has("mode");

  if (isSelector) {
    return <Selector />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
