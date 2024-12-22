import { useState } from "react";
import { RiArrowDropRightLine } from "@remixicon/react";

import { assert } from "../util";

export type ContextMenuEntry = ContextMenuItem | ContextMenuGroup;

export interface ContextMenuItem {
  type: "ITEM";

  /** The content that will be displayed in the context menu. */
  content: React.ReactNode

  /** The action to perform when the item is select. */
  onChoose: (item: ContextMenuItem) => void;
}

export interface ContextMenuGroup {
  type: "GROUP";

  /** The content that will be displayed in the context menu. */
  content: React.ReactNode;

  /** The sub-entries of the context menu group. */
  entries: ContextMenuEntry[];
}

export function ContextMenu({ title, entries, openSide, nestLevel }: {
  title?: string,
  entries: ContextMenuEntry[],
  openSide: "LEFT" | "RIGHT",
  nestLevel?: number
}) {
  const [hoverTimeoutId, setHoverTimeoutId] = useState<number | null>(null);

  function onItemMouseEnter(ev: React.MouseEvent<HTMLDivElement>) {
    onItemMouseLeave();

    setHoverTimeoutId(window.setTimeout(() => {
      assert(ev.target instanceof HTMLElement, "ev.target was not an HTMLElement");
      ev.target.focus();
    }, 100));
  }

  function onItemMouseLeave() {
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId);
      setHoverTimeoutId(null);
    }
  }

  return (
    <div
      role="menu"
      className={`
        bg-white rounded-box w-[300px] border-gray-200 border
        shadow-[0_7px_9px_0_rgba(0,0,0,0.02)]
      `}
    >
      <ul className="menu menu-sm menu-vertical before:hidden ml-2">
        { !title ? <></> : <>
          <li className="px-3 py-1 font-bold">{title}</li> 
          <div className="divider p-0 m-0"/>
        </> }

        { entries.map((x, i) => {
          if (x.type == "GROUP") {
            return (
              <li key={i}>
                <div className={`
                  dropdown w-full flex flex-col
                  ${openSide == "LEFT" ? "sm:dropdown-left" : "sm:dropdown-right"}
                `}>
                  <div role="button"
                    tabIndex={0}
                    className="w-full flex justify-between"
                    onMouseEnter={onItemMouseEnter}
                    onMouseLeave={onItemMouseLeave}
                  >
                    <div>{x.content}</div>
                    <div><RiArrowDropRightLine/></div>
                  </div>

                  <div tabIndex={0} className="dropdown-content" style={{ zIndex: 10 + (nestLevel ?? 0) }}>
                    <ContextMenu
                      entries={x.entries}
                      openSide={openSide}
                      nestLevel={nestLevel ?? 0 + 1}
                    />
                  </div>
                </div>
              </li>
            )
          } else {
            return (
              <li className="h-8" key={i}>
                <a href="#"
                  role="menuitem"
                  onClick={() => x.onChoose(x)}
                  className="flex w-full h-full align-middle"
                >{x.content}</a>
              </li>
            )
          }
        }) }
      </ul>
    </div>
  );
}