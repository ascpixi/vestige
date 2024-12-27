import * as tone from "tone";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

import App from "./App.tsx";

tone.setContext(new tone.Context({
  clockSource: "timeout",
  latencyHint: "playback",
  updateInterval: 0.05 / 2
}));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
