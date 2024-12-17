import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as tone from "tone";

import "./index.css";

import { AppWrapper } from "./AppWrapper.tsx";
import App from "./App.tsx";

tone.setContext(new tone.Context({
  latencyHint: "playback",
  updateInterval: 0.05
}));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
