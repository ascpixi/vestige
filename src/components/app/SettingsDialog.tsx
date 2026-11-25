import React, { forwardRef, useState } from "react";
import { RiCloseLine, RiCompass3Line, RiInformation2Line, RiKeyboardLine } from "@remixicon/react";

import { MOD_KEY } from "../../environment";
import { PanMode, PersistentData, ScrollMode } from "../../persistent";
import { Link } from "../Link";

import iconShadow from "../../assets/icon-shadow.svg";

type SettingsCategory = "NAVIGATION" | "KEYBOARD" | "ABOUT";

interface SettingsCategoryEntry {
  id: SettingsCategory;
  name: string;
  icon: (className: string) => React.ReactNode;
}

const CATEGORIES: SettingsCategoryEntry[] = [
  { id: "NAVIGATION", name: "Navigation", icon: cls => <RiCompass3Line className={cls}/> },
  { id: "KEYBOARD", name: "Keyboard", icon: cls => <RiKeyboardLine className={cls}/> },
  { id: "ABOUT", name: "About", icon: cls => <RiInformation2Line className={cls}/> }
];

const SHORTCUTS: { group: string, entries: [string, string][] }[] = [
  {
    group: "Canvas",
    entries: [
      ["Right click / Shift+A", "Add a node"],
      ["Shift+drag", "Select nodes in a rectangle"],
      [`${MOD_KEY}+A`, "Select all nodes"],
      ["Esc", "Close the add menu"]
    ]
  },
  {
    group: "Editing",
    entries: [
      [`${MOD_KEY}+C`, "Copy selected nodes"],
      [`${MOD_KEY}+X`, "Cut selected nodes"],
      [`${MOD_KEY}+V`, "Paste at the cursor"],
      [`Shift+D / ${MOD_KEY}+D`, "Duplicate selected nodes"],
      ["Delete / Backspace", "Delete selected nodes"],
      ["H", "Collapse or expand selected nodes"]
    ]
  },
  {
    group: "Application",
    entries: [
      [`${MOD_KEY}+,`, "Open settings"]
    ]
  }
];

/** A schematic drawing of a mouse, with the button that pans the canvas highlighted. */
function MouseDiagram({ highlight }: { highlight: "LEFT" | "MIDDLE" }) {
  return (
    <svg viewBox="0 0 40 56" className="w-9 h-12 shrink-0" aria-hidden>
      <rect x="2" y="2" width="36" height="52" rx="18" className="fill-white stroke-gray-300" strokeWidth="2"/>
      <path
        d="M2 20 V20 A18 18 0 0 1 20 2 V20 Z"
        className={highlight == "LEFT" ? "fill-primary/70" : "fill-transparent"}
      />
      <line x1="20" y1="2" x2="20" y2="20" className="stroke-gray-300" strokeWidth="2"/>
      <line x1="2" y1="20" x2="38" y2="20" className="stroke-gray-300" strokeWidth="2"/>
      <rect
        x="17" y="7" width="6" height="10" rx="3"
        className={highlight == "MIDDLE" ? "fill-primary stroke-primary" : "fill-white stroke-gray-400"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** A large, selectable card, used for mutually exclusive options. */
function OptionCard({ selected, onSelect, title, description, illustration }: {
  selected: boolean,
  onSelect: () => void,
  title: string,
  description: React.ReactNode,
  illustration: React.ReactNode
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`
        flex gap-3 p-3 text-left rounded-box border transition-colors cursor-pointer
        ${selected ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}
      `}
    >
      {illustration}

      <div className="flex flex-col gap-1">
        <span className="font-semibold">{title}</span>
        <span className="text-gray-500 leading-relaxed">{description}</span>
      </div>
    </button>
  );
}

/**
 * A single setting, with its label and description on the left, and its control below or
 * on the right.
 */
function SettingRow({ label, description, children, stacked }: React.PropsWithChildren<{
  label: string,
  description?: React.ReactNode,

  /** If `true`, the control is placed below the label, taking up the full width. */
  stacked?: boolean
}>) {
  return (
    <div className={`
      flex py-4 border-b border-gray-100 last:border-b-0
      ${stacked ? "flex-col gap-3" : "items-center justify-between gap-6"}
    `}>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="font-semibold">{label}</span>
        { !description ? <></> : <span className="text-gray-500 leading-relaxed">{description}</span> }
      </div>

      {children}
    </div>
  );
}

export const SettingsDialog = forwardRef((
  { settings, onChange }: {
    settings: PersistentData,
    onChange: (changes: Partial<PersistentData>) => void
  },
  ref: React.ForwardedRef<HTMLDialogElement>
) => {
  const [category, setCategory] = useState<SettingsCategory>("NAVIGATION");
  const current = CATEGORIES.find(x => x.id == category)!;

  return (
    <dialog ref={ref} className="modal">
      <div className="modal-box bg-white p-0 w-[min(94vw,1040px)] max-w-none h-[min(88vh,640px)] flex overflow-hidden text-xs">
        <aside className="w-56 shrink-0 flex flex-col bg-gray-50 border-r border-gray-200">
          <h2 className="px-5 pt-5 pb-4 text-sm font-bold">Settings</h2>

          <ul className="menu menu-sm w-full p-0" role="tablist">
            {
              CATEGORIES.map(x => (
                <li key={x.id}>
                  <button
                    role="tab"
                    aria-selected={x.id == category}
                    onClick={() => setCategory(x.id)}
                    className={`flex items-center gap-2 px-5 py-2 rounded-none ${x.id == category ? "menu-active" : ""}`}
                  >
                    {x.icon("w-4 h-4")}
                    {x.name}
                  </button>
                </li>
              ))
            }
          </ul>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between h-14 px-6 shrink-0 border-b border-gray-200">
            <h3 className="text-sm font-semibold">{current.name}</h3>

            <form method="dialog">
              <button
                className="p-1 rounded-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Close"
              >
                <RiCloseLine className="w-5 h-5"/>
              </button>
            </form>
          </header>

          <div className="flex-1 overflow-y-auto px-6">
            {
              category != "NAVIGATION" ? <></> : <>
                <SettingRow
                  label="Drag behavior"
                  description="This changes what dragging on an empty part of the canvas does."
                  stacked
                >
                  <div role="radiogroup" className="grid grid-cols-2 gap-3">
                    <OptionCard
                      selected={settings.panMode == "LEFT"}
                      onSelect={() => onChange({ panMode: "LEFT" as PanMode })}
                      title="Left button pans"
                      description={<>
                        Hold <kbd className="kbd kbd-xs">Shift</kbd> and drag to select nodes.
                        This works well with trackpads.
                      </>}
                      illustration={<MouseDiagram highlight="LEFT"/>}
                    />

                    <OptionCard
                      selected={settings.panMode == "MIDDLE"}
                      onSelect={() => onChange({ panMode: "MIDDLE" as PanMode })}
                      title="Middle button pans"
                      description={<>
                        Drag with the left button to select nodes. You will need a mouse with
                        a middle button.
                      </>}
                      illustration={<MouseDiagram highlight="MIDDLE"/>}
                    />
                  </div>
                </SettingRow>

                <SettingRow
                  label="Scroll wheel"
                  description="Trackpad users may prefer to pan with two fingers, and zoom by pinching."
                >
                  <div className="join shrink-0" role="radiogroup">
                    {
                      ([["ZOOM", "Zoom"], ["PAN", "Pan"]] as [ScrollMode, string][]).map(([mode, label]) => (
                        <button
                          key={mode}
                          role="radio"
                          aria-checked={settings.scrollMode == mode}
                          onClick={() => onChange({ scrollMode: mode })}
                          className={`join-item btn btn-sm ${settings.scrollMode == mode ? "btn-primary" : ""}`}
                        >
                          {label}
                        </button>
                      ))
                    }
                  </div>
                </SettingRow>
              </>
            }

            {
              category != "ABOUT" ? <></> : (
                <div className="flex flex-col gap-8 py-6">
                  <div className="flex items-center gap-6">
                    <img className="w-24 shrink-0" src={iconShadow} alt="Vestige logo"/>

                    <div className="flex flex-col gap-2">
                      <span className="text-base font-bold">Vestige</span>
                      <p className="text-gray-600 leading-relaxed max-w-[60ch]">
                        Vestige is an open-source generative music synthesizer, created
                        by <Link href="https://ascpixi.dev">@ascpixi</Link> for the Hack Club High Seas
                        2024 event. The source code is available
                        at <Link href="https://github.com/ascpixi/vestige">ascpixi/vestige</Link>.
                      </p>
                    </div>
                  </div>
                </div>
              )
            }

            {
              category != "KEYBOARD" ? <></> : <>
                {
                  SHORTCUTS.map(group => (
                    <div key={group.group} className="py-4 border-b border-gray-100 last:border-b-0">
                      <h4 className="mb-2 font-semibold text-gray-500">{group.group}</h4>

                      <table className="w-full">
                        <tbody>
                          {
                            group.entries.map(([keys, action]) => (
                              <tr key={keys} className="h-8">
                                <td className="text-gray-700">{action}</td>
                                <td className="text-right"><kbd className="kbd kbd-xs">{keys}</kbd></td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  ))
                }
              </>
            }
          </div>
        </section>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
});
