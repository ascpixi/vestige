import { RiArrowDownSLine } from "@remixicon/react";
import { useNodeId, useReactFlow } from "@xyflow/react";
import React, { createContext, PropsWithChildren, RefObject, useRef, useState } from "react";

import { NodeData } from "../graph";

/** Provides information about the parameter group a field is placed in. */
export const ParamGroupContext = createContext<{
  folded: boolean,
  headerRef: RefObject<HTMLDivElement | null>
} | null>(null);

/**
 * A named group of parameters of a node, which the user can fold in order to hide it.
 * Ports inside of a folded group are moved next to its header.
 */
export function ParamGroup({ name, children }: PropsWithChildren<{
  name: string
}>) {
  const nodeId = useNodeId();
  const { getNode } = useReactFlow();
  const headerRef = useRef<HTMLDivElement>(null);

  function getData() {
    if (!nodeId)
      return undefined;

    return getNode(nodeId)?.data as NodeData | undefined;
  }

  const [folded, setFolded] = useState(() => getData()?.foldedGroups?.includes(name) ?? false);

  function toggle() {
    const data = getData();
    if (data) {
      const others = (data.foldedGroups ?? []).filter(x => x != name);
      data.foldedGroups = folded ? others : [...others, name];
    }

    setFolded(!folded);
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLDivElement>) {
    if (ev.key == "Enter" || ev.key == " ") {
      toggle();
      ev.preventDefault();
    }
  }

  return (
    <ParamGroupContext.Provider value={{ folded, headerRef }}>
      <section className="flex flex-col gap-6">
        <div className="-mb-2 pt-3 border-t border-gray-200">
          <div
            ref={headerRef}
            role="button"
            tabIndex={0}
            onClick={toggle}
            onKeyDown={handleKeyDown}
            className="nodrag flex items-center gap-1 w-fit text-gray-500 hover:text-gray-900 transition-colors cursor-pointer select-none"
            aria-expanded={!folded}
          >
            <RiArrowDownSLine className={`w-4 h-4 transition-transform duration-200 ${folded ? "-rotate-90" : ""}`}/>
            <span className="font-semibold">{name}</span>
          </div>
        </div>

        <div className={folded ? "h-0 -mt-6 overflow-hidden" : "flex flex-col gap-6"}>
          {children}
        </div>
      </section>
    </ParamGroupContext.Provider>
  );
}
