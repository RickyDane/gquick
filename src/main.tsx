import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Selector from "./Selector";
import "./index.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

function Root() {
  const [label, setLabel] = useState<string | null>(null);

  // Selector windows are created with `index.html?mode=screenshot|ocr`.
  // Check this synchronously so selector rendering does not depend on the
  // Tauri window API being ready on every platform/webview.
  const params = new URLSearchParams(window.location.search);
  const hasSelectorMode = params.has("mode");

  useEffect(() => {
    const window = getCurrentWindow();
    setLabel(window.label);
  }, []);

  if (hasSelectorMode) {
    return <Selector />;
  }

  // Prevent rendering anything until we know which window we are
  if (label === null) {
    return null;
  }

  if (label === "selector") {
    return <Selector />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
