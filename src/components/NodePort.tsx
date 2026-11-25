import { Connection, Edge, Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { PropsWithChildren, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { NOTE_INPUT_HID_PREFIX, SIGNAL_INPUT_HID_PREFIX, VALUE_INPUT_HID_PREFIX } from "../graph";
import { match } from "../util";

import { NODE_HEADER_HEIGHT, NodeCollapsedContext } from "./VestigeNodeBase";
import { ParamGroupContext } from "./ParamGroup";

/** The distance between the top of a port and the center of its handle, in pixels. */
const HANDLE_OFFSET = 8;

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
  const collapsed = useContext(NodeCollapsedContext);
  const group = useContext(ParamGroupContext);
  const [offsetTop, setOffsetTop] = useState(0);

  useLayoutEffect(() => {
    // When the parameter group we're in is folded, our handle sits next to the header of the group.
    const anchor = group?.folded ? group.headerRef.current : selfRef.current;

    if (anchor && anchor.offsetTop != offsetTop) {
      setOffsetTop(anchor.offsetTop);
    }
  });

  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [nodeId, offsetTop, collapsed, group?.folded, updateNodeInternals]);

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
        style={{
          top: collapsed ? -NODE_HEADER_HEIGHT / 2 : offsetTop + HANDLE_OFFSET
        }}
        isValidConnection={checkValidConnection}
      />
    </>
  );
}