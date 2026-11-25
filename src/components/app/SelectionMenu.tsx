import React from "react";
import { RiClipboardLine, RiCollapseVerticalLine, RiDeleteBinLine, RiFileCopyLine, RiFileCopy2Line, RiScissorsLine } from "@remixicon/react";

import { MOD_KEY } from "../../environment";
import { clamp } from "../../util";

const MENU_WIDTH = 240; // pixels
const MENU_HEIGHT = 300; // pixels

/** The smallest distance between the menu and the edges of the window, in pixels. */
const WINDOW_MARGIN = 8;

export interface SelectionMenuAction {
  label: string;
  icon: (className: string) => React.ReactNode;
  shortcut: string;
  disabled?: boolean;
  danger?: boolean;
  onChoose: () => void;
}

/**
 * A context menu for the currently selected nodes.
 */
export function SelectionMenu({
  x, y, title, canEdit, canPaste,
  onCopy, onCut, onPaste, onDuplicate, onToggleCollapse, onDelete, onClose
}: {
  x: number,
  y: number,

  /** Describes what the menu applies to, e.g. the name of a node. */
  title: string,

  /** If `false`, actions that modify or copy the selection are disabled. */
  canEdit: boolean,

  /** If `false`, pasting is disabled. */
  canPaste: boolean,

  onCopy: () => void,
  onCut: () => void,
  onPaste: () => void,
  onDuplicate: () => void,
  onToggleCollapse: () => void,
  onDelete: () => void,
  onClose: () => void
}) {
  const groups: SelectionMenuAction[][] = [
    [
      {
        label: "Copy",
        icon: cls => <RiFileCopyLine className={cls}/>,
        shortcut: `${MOD_KEY}+C`,
        disabled: !canEdit,
        onChoose: onCopy
      },
      {
        label: "Cut",
        icon: cls => <RiScissorsLine className={cls}/>,
        shortcut: `${MOD_KEY}+X`,
        disabled: !canEdit,
        onChoose: onCut
      },
      {
        label: "Paste",
        icon: cls => <RiClipboardLine className={cls}/>,
        shortcut: `${MOD_KEY}+V`,
        disabled: !canPaste,
        onChoose: onPaste
      },
      {
        label: "Duplicate",
        icon: cls => <RiFileCopy2Line className={cls}/>,
        shortcut: "Shift+D",
        disabled: !canEdit,
        onChoose: onDuplicate
      }
    ],
    [
      {
        label: "Collapse / Expand",
        icon: cls => <RiCollapseVerticalLine className={cls}/>,
        shortcut: "H",
        onChoose: onToggleCollapse
      }
    ],
    [
      {
        label: "Delete",
        icon: cls => <RiDeleteBinLine className={cls}/>,
        shortcut: "Del",
        disabled: !canEdit,
        danger: true,
        onChoose: onDelete
      }
    ]
  ];

  const { clientWidth, clientHeight } = document.body;
  const left = clamp(x, WINDOW_MARGIN, clientWidth - MENU_WIDTH - WINDOW_MARGIN);
  const top = clamp(y, WINDOW_MARGIN, clientHeight - MENU_HEIGHT - WINDOW_MARGIN);

  function handleContextMenu(ev: React.MouseEvent<HTMLDivElement>) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLDivElement>) {
    if (ev.key == "Escape") {
      onClose();
    }
  }

  function handleChoose(action: SelectionMenuAction) {
    action.onChoose();
    onClose();
  }

  return (
    <div
      role="menu"
      style={{ top, left, width: MENU_WIDTH }}
      className="absolute z-50 text-sm bg-white rounded-box border border-gray-200 shadow-lg"
      onContextMenu={handleContextMenu}
      onMouseDownCapture={ev => ev.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <div className="px-4 h-9 flex items-center border-b border-gray-200 text-xs font-semibold text-gray-500 truncate">
        {title}
      </div>

      {
        groups.map((group, i) => (
          <ul key={i} className={`menu menu-sm w-full ${i != 0 ? "border-t border-gray-100" : ""}`}>
            {
              group.map(action => (
                <li key={action.label} className={action.disabled ? "menu-disabled" : ""}>
                  <button
                    role="menuitem"
                    disabled={action.disabled}
                    onClick={() => handleChoose(action)}
                    className={`flex items-center gap-2 ${action.danger && !action.disabled ? "text-error" : ""}`}
                  >
                    {action.icon("w-4 h-4 shrink-0")}
                    <span className="grow text-left whitespace-nowrap">{action.label}</span>
                    <kbd className="text-[0.7rem] opacity-50">{action.shortcut}</kbd>
                  </button>
                </li>
              ))
            }
          </ul>
        ))
      }
    </div>
  );
}
