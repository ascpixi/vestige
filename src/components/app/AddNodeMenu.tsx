import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RiArrowRightSLine, RiSearchLine } from "@remixicon/react";

import { NodeTypeDescriptor } from "../../nodes";
import { NODE_CATEGORIES } from "../../nodes/catalog";
import { clamp } from "../../util";

const MENU_WIDTH = 300; // pixels

/** The smallest distance between the menu and the edges of the window, in pixels. */
const WINDOW_MARGIN = 8;

/** The vertical padding of a list of menu entries, in pixels. */
const MENU_PADDING = 8;

/**
 * Returns `true` if all characters of `query` appear in `text`, in order.
 */
function fuzzyMatches(text: string, query: string) {
  text = text.toLowerCase();
  query = query.toLowerCase();

  let matched = 0;
  for (const char of text) {
    if (char == query[matched]) {
      matched++;
    }

    if (matched == query.length) {
      return true;
    }
  }

  return matched == query.length;
}

/**
 * Ranks how closely `text` matches the given search query. Entries with a lower rank
 * should be displayed before the ones with a higher rank.
 */
function searchRank(text: string, query: string) {
  text = text.toLowerCase();
  query = query.toLowerCase();

  if (text.startsWith(query))
    return 0;

  const words = text.split(/\s+/);
  if (words.some(x => x.startsWith(query)))
    return 1;

  if (text.includes(query))
    return 2;

  return 3;
}

function MenuEntry({ descriptor, active, onChoose, onHover, hint }: {
  descriptor: NodeTypeDescriptor,
  active?: boolean,
  hint?: string,
  onChoose: () => void,
  onHover?: () => void
}) {
  return (
    <li>
      <button
        role="menuitem"
        onClick={onChoose}
        onMouseEnter={onHover}
        className={`flex items-center gap-2 ${active ? "menu-active" : ""}`}
      >
        {descriptor.icon("w-4 h-4 shrink-0")}
        <span className="grow text-left whitespace-nowrap">{descriptor.displayName}</span>
        { !hint ? <></> : <span className="text-[0.7rem] opacity-50 whitespace-nowrap">{hint}</span> }
      </button>
    </li>
  );
}

export function AddNodeMenu({ x, y, show, onNodeChoose, onClose }: {
  x: number,
  y: number,
  show: boolean,
  onNodeChoose: (descriptor: NodeTypeDescriptor) => void,
  onClose: () => void
}) {
  const [query, setQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<number | null>(null);
  const [activeResult, setActiveResult] = useState(0);
  const [height, setHeight] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<(HTMLLIElement | null)[]>([]);

  if (x == 1 && y == 1) {
    // Touch devices seem to report the event originating at (1, 1) - in this
    // case, we position the context menu at the top of the page, centered horizontally.
    x = (document.body.clientWidth / 2) - (MENU_WIDTH / 2);
    y = 96;
  }

  const results = useMemo(() => {
    if (query.trim() == "")
      return [];

    return NODE_CATEGORIES
      .flatMap(category => category.entries.map(descriptor => ({
        descriptor,
        category: category.name,
        rank: searchRank(descriptor.displayName, query)
      })))
      .filter(x => fuzzyMatches(x.descriptor.displayName, query.trim()))
      .sort((a, b) => a.rank - b.rank);
  }, [query]);

  useEffect(() => {
    if (!show)
      return;

    setQuery("");
    setOpenCategory(null);
    setActiveResult(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [show, x, y]);

  useLayoutEffect(() => {
    if (rootRef.current) {
      setHeight(rootRef.current.offsetHeight);
    }
  }, [show, results.length]);

  useEffect(() => setActiveResult(0), [query]);

  const viewportWidth = document.body.clientWidth;
  const viewportHeight = document.body.clientHeight;

  const left = clamp(x, WINDOW_MARGIN, viewportWidth - MENU_WIDTH - WINDOW_MARGIN);
  const top = clamp(y, WINDOW_MARGIN, viewportHeight - height - WINDOW_MARGIN);
  const openLeft = left + (MENU_WIDTH * 2) > viewportWidth;

  function handleContextMenu(ev: React.MouseEvent<HTMLDivElement>) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    ev.stopPropagation();

    if (ev.key == "Escape") {
      onClose();
    }
    else if (ev.key == "ArrowDown") {
      setActiveResult(i => Math.min(results.length - 1, i + 1));
      ev.preventDefault();
    }
    else if (ev.key == "ArrowUp") {
      setActiveResult(i => Math.max(0, i - 1));
      ev.preventDefault();
    }
    else if (ev.key == "Enter" && results[activeResult]) {
      onNodeChoose(results[activeResult].descriptor);
    }
  }

  const submenuTop = openCategory != null
    ? (categoryRefs.current[openCategory]?.offsetTop ?? 0) - MENU_PADDING
    : 0;

  return (
    <div
      ref={rootRef}
      style={{ top, left, width: MENU_WIDTH }}
      className={`absolute z-50 text-sm ${show ? "" : "hidden"}`}
      onContextMenu={handleContextMenu}
      onMouseDownCapture={ev => ev.stopPropagation()}
      onMouseLeave={() => setOpenCategory(null)}
    >
      <div role="menu" className="bg-white rounded-box border border-gray-200 shadow-lg">
        <label className="flex items-center gap-2 px-3 h-10 border-b border-gray-200 text-gray-400">
          <RiSearchLine className="w-4 h-4 shrink-0"/>

          <input
            ref={searchRef}
            value={query}
            onChange={ev => setQuery(ev.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search…"
            className="w-full outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
            aria-label="Search nodes"
          />
        </label>

        {
          query.trim() != "" ? (
            <ul className="menu menu-sm w-full">
              {
                results.length == 0
                  ? <li className="menu-disabled"><span>No matching nodes</span></li>
                  : results.map((x, i) => (
                    <MenuEntry
                      key={x.descriptor.displayName}
                      descriptor={x.descriptor}
                      hint={x.category}
                      active={i == activeResult}
                      onHover={() => setActiveResult(i)}
                      onChoose={() => onNodeChoose(x.descriptor)}
                    />
                  ))
              }
            </ul>
          ) : (
            <ul className="menu menu-sm w-full">
              {
                NODE_CATEGORIES.map((category, i) => (
                  <li
                    key={category.name}
                    ref={element => {
                      categoryRefs.current[i] = element;
                    }}
                  >
                    <button
                      onMouseEnter={() => setOpenCategory(i)}
                      onClick={() => setOpenCategory(i)}
                      className={`flex justify-between ${openCategory == i ? "menu-active" : ""}`}
                      aria-haspopup="menu"
                      aria-expanded={openCategory == i}
                    >
                      <span>{category.name}</span>
                      <RiArrowRightSLine className="w-4 h-4"/>
                    </button>
                  </li>
                ))
              }
            </ul>
          )
        }
      </div>

      {
        openCategory == null || query.trim() != "" ? <></> : (
          <div
            role="menu"
            style={{
              top: submenuTop,
              width: MENU_WIDTH,
              ...(openLeft ? { right: MENU_WIDTH - 4 } : { left: MENU_WIDTH - 4 })
            }}
            className="absolute bg-white rounded-box border border-gray-200 shadow-lg"
          >
            <ul className="menu menu-sm w-full">
              {
                NODE_CATEGORIES[openCategory].entries.map(descriptor => (
                  <MenuEntry
                    key={descriptor.displayName}
                    descriptor={descriptor}
                    onChoose={() => onNodeChoose(descriptor)}
                  />
                ))
              }
            </ul>
          </div>
        )
      }
    </div>
  );
}