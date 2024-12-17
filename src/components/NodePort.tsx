import { Connection, Edge, Handle, Position } from "@xyflow/react";
import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { NOTE_INPUT_HID_PREFIX, SIGNAL_INPUT_HID_PREFIX, VALUE_INPUT_HID_PREFIX } from "../graph";
import { match } from "../util";

/**
 * Renders an input to or an output of a node, as represented by a React Flow handle.
 */
export function NodePort({ offset, kind, type, handleId, children }: PropsWithChildren<{
  offset: number,
  handleId: string,
  kind: "input" | "output",
  type: "value" | "signal" | "notes"
}>) {
  const selfRef = useRef<HTMLDivElement>(null);
  const [topOffset, setTopOffset] = useState<number>(offset);

  useEffect(() => {
    if (selfRef.current) {
      setTopOffset(selfRef.current.offsetTop + 8);
    }
  }, []);

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
      
      {
        topOffset == null ? <></> :
        <Handle id={handleId}
          type={kind === "input" ? "target" : "source"}
          position={kind === "input" ? Position.Left : Position.Right}
          className={handleClass}
          style={{ top: topOffset }}
          isValidConnection={checkValidConnection}
        />
      }
    </>
  );
}