import { useState } from "react";
import App from "./App";

export function AppWrapper() {
  const [gotInteraction, setGotInteraction] = useState(false);

  function handleOpen() {
    setGotInteraction(true);
  }

  return (
    gotInteraction ? <App /> : (
      <main>
        <h1>Vestige</h1>
        <p>Hi, welcome to Vestige!</p>
        <button onClick={handleOpen} className="btn btn-primary">Open</button>
      </main>
    )
  );
} 