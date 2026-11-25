import { RiArrowDownSLine, RiCloseLine, RiQuestionLine } from "@remixicon/react";
import { NodeResizeControl, useReactFlow, useStore, useUpdateNodeInternals } from "@xyflow/react";
import React, { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { NodeData } from "../graph";
import { assert } from "../util";

import { HelpContext } from "./app/HelpContext";

/** The height of the header of a node, in pixels. */
export const NODE_HEADER_HEIGHT = 36;

/** Provides `true` to all descendants of a node that is currently collapsed. */
export const NodeCollapsedContext = createContext(false);

/** Maps the IDs of nodes to functions that release their resources (e.g. audio nodes). */
const nodeDisposers = new Map<string, () => void>();

/**
 * Releases the resources held by the node with the given ID. Should be called whenever a
 * node is removed from the graph.
 */
export function disposeNode(id: string) {
  nodeDisposers.get(id)?.();
  nodeDisposers.delete(id);
}

/**
 * Represents the basis for all nodes provided by Vestige.
 */
export function VestigeNodeBase({
  id, name, help, onRemove, className, resizable, children
}: PropsWithChildren<{
  id: string,
  name: string
  help: React.ReactNode,
  onRemove?: () => void,
  className?: string,

  /**
   * If specified, the node can be resized from its lower right corner. Its contents should
   * then fill the available space.
   */
  resizable?: { minWidth: number, minHeight: number }
}>) {
  const { deleteElements, getNode } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const helpPanel = useContext(HelpContext);

  // Once a node has been resized, React Flow gives it an explicit size, which we fill.
  const isSized = useStore(s => !!s.nodeLookup.get(id)?.width);

  const [collapsed, setCollapsed] = useState(() => getData()?.collapsed ?? false);

  function getData() {
    return getNode(id)?.data as NodeData | undefined;
  }

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, collapsed, updateNodeInternals]);

  useEffect(() => {
    function handleToggle(ev: Event) {
      if ((ev as CustomEvent<string>).detail == id) {
        toggleCollapsed();
      }
    }

    window.addEventListener(TOGGLE_COLLAPSE_EVENT, handleToggle);
    return () => window.removeEventListener(TOGGLE_COLLAPSE_EVENT, handleToggle);
  });

  function toggleCollapsed() {
    const data = getData();
    if (data) {
      data.collapsed = !collapsed;
    }

    setCollapsed(!collapsed);
  }

  useEffect(() => {
    if (onRemove) {
      nodeDisposers.set(id, onRemove);
    }
  });

  function removeSelf() {
    assert(onRemove, "onRemove was null, but removeSelf was invoked");

    // The node will be disposed of when React Flow reports its removal.
    deleteElements({ nodes: [{ id }] });
  }

  const filling = resizable && isSized && !collapsed;

  return (
    <>
      {
        !resizable || collapsed ? <></> : (
          <NodeResizeControl
            position="bottom-right"
            minWidth={resizable.minWidth}
            minHeight={resizable.minHeight}
            className="bg-transparent! border-none! z-10"
          >
            <svg
              viewBox="0 0 10 10"
              className="absolute right-1.5 bottom-1.5 w-2.5 h-2.5 text-gray-400 hover:text-gray-700 cursor-nwse-resize"
            >
              <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
          </NodeResizeControl>
        )
      }

      <div
        style={resizable && !filling ? { minWidth: resizable.minWidth } : undefined}
        className={twMerge(
          "vestige-node flex flex-col text-xs border border-solid border-gray-200 h-full rounded-2xl w-[400px] bg-white/70 shadow-[0_7px_9px_0_rgba(0,0,0,0.02)]",
          className,
          filling ? "w-full h-full" : "",
          collapsed ? "h-auto" : ""
        )}
      >
        <header
          style={{ height: NODE_HEADER_HEIGHT }}
          className={`
            flex items-center justify-between gap-2
            pl-2 pr-3 font-semibold
            ${collapsed ? "rounded-2xl" : "border-b border-solid border-gray-200 rounded-t-2xl"}
          `}
        >
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={toggleCollapsed}
              className="nodrag p-0.5 rounded-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
              title={collapsed ? "Expand (H)" : "Collapse (H)"}
              aria-expanded={!collapsed}
            >
              <RiArrowDownSLine className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}/>
            </button>

            <div className="truncate">{name}</div>
          </div>

          <div className="flex items-center gap-1 text-gray-400">
            <button
              onClick={() => helpPanel.show({ title: name, content: help })}
              className="nodrag p-0.5 rounded-sm hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
              title="Help"
            >
              <RiQuestionLine className="w-4 h-4"/>
            </button>

            { !onRemove ? <></> :
              <button
                onClick={removeSelf}
                className="nodrag p-0.5 rounded-sm hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Remove"
              >
                <RiCloseLine className="w-4 h-4"/>
              </button>
            }
          </div>
        </header>

        <main className={`
          relative bg-white flex rounded-b-2xl
          ${collapsed ? "h-0 p-0" : "py-3 pb-6 px-4"}
          ${resizable && !collapsed ? "flex-1 min-h-0" : ""}
        `}>
          <NodeCollapsedContext.Provider value={collapsed}>
            <div className={`
              w-full
              ${collapsed ? "h-0 overflow-hidden" : ""}
              ${resizable && !collapsed ? "flex flex-col" : ""}
            `}>
              {children}
            </div>
          </NodeCollapsedContext.Provider>
        </main>
      </div>

    </>
  );
}

const TOGGLE_COLLAPSE_EVENT = "vestige-toggle-collapse";

/** Toggles the collapsed state of the node with the given ID. */
export function toggleNodeCollapsed(id: string) {
  window.dispatchEvent(new CustomEvent(TOGGLE_COLLAPSE_EVENT, { detail: id }));
}
