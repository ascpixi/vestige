import { Connection, Edge, Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { PropsWithChildren, useRef } from "react";

import { NOTE_INPUT_HID_PREFIX, SIGNAL_INPUT_HID_PREFIX, VALUE_INPUT_HID_PREFIX } from "../graph";
import { match } from "../util";

/**
 * Renders an input to or an output of a node, as represented by a React Flow handle.
 */
export function NodePort({ nodeId, kind, type, handleId, children }: PropsWithChildren<{
  nodeId: string,
  handleId: string,
  kind: "input" | "output",
  type: "value" | "signal" | "notes"
}>) {
  const updateNodeInternals = useUpdateNodeInternals();

  const selfRef = useRef<HTMLDivElement>(null);

  if (selfRef.current) {
    updateNodeInternals(nodeId);
  }

  const handleClass = match(type, {
    "value": "handle-value",
    "signal": "handle-signal",
    "notes": "handle-notes"
  });

  function checkValidConnection(conn: Edge | Connection): boolean {
    const src = kind === "input" ? conn.sourceHandle : conn.targetHandle;

    const prefix = match(type, {
      "value": VALUE_INPUT_HID_PREFIX,
      "notes": NOTE_INPUT_HID_PREFIX,
      "signal": SIGNAL_INPUT_HID_PREFIX
    });

    return src?.startsWith(prefix) ?? false;
  }

  return (
    <>
      <div ref={selfRef}>{children}</div>
      
      <Handle id={handleId}
        type={kind === "input" ? "target" : "source"}
        position={kind === "input" ? Position.Left : Position.Right}
        className={handleClass}
        style={{ top: selfRef.current ? selfRef.current.offsetTop + 8 : 8 }}
        isValidConnection={checkValidConnection}
      />
    </>
  );
}