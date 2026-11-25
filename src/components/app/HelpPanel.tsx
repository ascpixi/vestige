import { useEffect, useMemo, useRef, useState } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine, RiBookOpenLine, RiCloseLine, RiKeyboardLine, RiLinksLine, RiPulseLine, RiQuestionFill, RiQuestionLine, RiRocketLine, RiSaveLine, RiSearchLine, RiCursorLine, RiTimerLine, RiMusic2Line } from "@remixicon/react";

import { MOD_KEY } from "../../environment";
import { NODE_CATEGORIES } from "../../nodes/catalog";
import { HelpPage } from "./HelpContext";

const SHORTCUTS: [string, string][] = [
  ["Right click", "add a node"],
  ["Shift+A", "add a node at the cursor"],
  ["Shift+drag", "select nodes in a rectangle"],
  [`${MOD_KEY}+C / X / V`, "copy, cut and paste nodes"],
  [`Shift+D`, "duplicate selected nodes"],
  ["Delete", "delete selected nodes"],
  ["H", "collapse selected nodes"],
  [`${MOD_KEY}+,`, "open settings"]
];

const GUIDES: HelpPage[] = [
  {
    title: "Getting started",
    icon: cls => <RiRocketLine className={cls}/>,
    content: <>
      <p>
        Vestige builds music out of nodes. A typical patch starts with a <b>note generator</b> (such
        as <b>Pentatonic Melody</b>), which feeds an <b>instrument</b> (such as <b>Synth</b>),
        which is then sent through <b>effects</b> into the <b>Output</b> node.
      </p>

      <p>
        Right click anywhere on the canvas, or press <kbd className="kbd kbd-xs">Shift+A</kbd>, to
        add a node. Start typing to search. Press the play button in the top left corner to start
        playback.
      </p>
    </>
  },
  {
    title: "Connecting nodes",
    icon: cls => <RiLinksLine className={cls}/>,
    content: <>
      <p>
        Drag from an output on the right side of a node to an input on the left side of another.
        Sockets are color-coded, and only sockets of the same color can be connected:
      </p>

      <ul className="list-disc pl-4">
        <li><b className="text-green-600">green</b> sockets carry notes,</li>
        <li><b className="text-blue-600">blue</b> sockets carry audio,</li>
        <li><b className="text-pink-600">pink</b> sockets carry values, which drive parameters.</li>
      </ul>

      <p>
        Each input accepts a single connection. To combine two audio signals, use
        the <b>Mix</b> node. Click the button in the middle of a connection to remove it.
      </p>
    </>
  },
  {
    title: "Modulation",
    icon: cls => <RiPulseLine className={cls}/>,
    content: <>
      <p>
        Any parameter with a pink socket can be driven by a value node: <b>LFO</b>, <b>Noise</b>,
        <b> Value</b>, <b>Math</b> or <b>Map Range</b>. While a parameter is driven by another node,
        its slider turns grey and follows the incoming value.
      </p>

      <p>
        Values are normalized from 0% to 100% of the range of the parameter. When an LFO or Noise
        node drives parameters that share a unit, its <b>min</b> and <b>max</b> are also shown in
        that unit (such as Hz), and can be edited in it directly.
      </p>
    </>
  },
  {
    title: "Tempo and rhythm",
    icon: cls => <RiTimerLine className={cls}/>,
    content: <>
      <p>
        Every rhythmic parameter (such as the step of an <b>Arpeggiator</b>, the time of
        a <b>Delay</b>, or the cycle of an <b>LFO</b>) can be synced to a tempo with
        the <RiMusic2Line className="inline w-3.5 h-3.5"/> toggle next to its value. Synced parameters
        are set in note divisions, such as 1/8 or 1/4 dotted, relative to the tempo of their node.
      </p>

      <p>
        Each node has its own tempo, but all of them share a single clock that starts with
        playback. Nodes at different tempos therefore stay in phase: 60 BPM lines up with every
        other beat of 120 BPM, and 90 BPM against 120 BPM forms a 3:4 polyrhythm. Triplets,
        quintuplets and septuplets allow for even more unusual subdivisions.
      </p>
    </>
  },
  {
    title: "Editing values",
    icon: cls => <RiBookOpenLine className={cls}/>,
    content: <>
      <p>
        Click the value next to the name of any slider to type in an exact number, in the unit
        that is displayed. Press <kbd className="kbd kbd-xs">Enter</kbd> to confirm,
        or <kbd className="kbd kbd-xs">Esc</kbd> to cancel.
      </p>

      <p>
        Nodes can be collapsed with the arrow in their header, and larger nodes split their
        parameters into groups, which can be folded individually. Connected sockets stay
        visible in both cases.
      </p>
    </>
  },
  {
    title: "Selecting and editing",
    icon: cls => <RiCursorLine className={cls}/>,
    content: <>
      <p>
        Click a node to select it, and hold <kbd className="kbd kbd-xs">Shift</kbd> (or {MOD_KEY})
        while clicking to select several. Hold <kbd className="kbd kbd-xs">Shift</kbd> and drag on
        the canvas to select every node within a rectangle. Selected nodes move together, and can
        be copied, cut, pasted, duplicated or deleted at once.
      </p>

      <p>
        Copied connections are kept as long as both of their ends were copied. If you prefer to select
        by dragging with the left mouse button, and to pan with the middle one, change
        the <b>drag behavior</b> in the settings.
      </p>
    </>
  },
  {
    title: "Keyboard shortcuts",
    icon: cls => <RiKeyboardLine className={cls}/>,
    content: (
      <table className="w-full">
        <tbody>
          {
            SHORTCUTS.map(([keys, action]) => (
              <tr key={keys}>
                <td className="py-1.5 pr-3 whitespace-nowrap"><kbd className="kbd kbd-xs">{keys}</kbd></td>
                <td className="py-1.5 text-gray-600">{action}</td>
              </tr>
            ))
          }
        </tbody>
      </table>
    )
  },
  {
    title: "Saving and rendering",
    icon: cls => <RiSaveLine className={cls}/>,
    content: <>
      <p>
        Projects can be saved as a file, or as a link that contains the whole project. Use
        <b> Render to audio file</b> in the save menu to export a WAV file. Renders always start
        from the beginning, including any <b>Audio Player</b> nodes.
      </p>

      <p>
        Audio files loaded into an Audio Player are embedded into the project, so large files
        result in large project files and links.
      </p>
    </>
  }
];

/** The help articles of every node, as listed in the help center. */
export const NODE_PAGES: HelpPage[] = NODE_CATEGORIES.flatMap(category =>
  category.entries.map(descriptor => ({
    title: descriptor.displayName,
    content: descriptor.help,
    icon: descriptor.icon,
    category: category.name
  }))
);

function ArticleLink({ page, onOpen }: { page: HelpPage, onOpen: (page: HelpPage) => void }) {
  return (
    <li>
      <button onClick={() => onOpen(page)} className="flex items-center gap-2 w-full">
        { page.icon?.("w-4 h-4 shrink-0 text-gray-500") }
        <span className="grow text-left">{page.title}</span>
        <RiArrowRightSLine className="w-4 h-4 text-gray-400"/>
      </button>
    </li>
  );
}

/**
 * A floating help center, containing guides and the documentation of every node.
 */
export function HelpPanel({ page, open, onPageChange, onOpenChange }: {
  /** The article to display, or `null` to display the index. */
  page: HelpPage | null,
  open: boolean,
  onPageChange: (page: HelpPage | null) => void,
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !page) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, page]);

  const results = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    if (!searchText)
      return [];

    return [...GUIDES, ...NODE_PAGES].filter(page =>
      page.title.toLowerCase().includes(searchText) ||
      page.category?.toLowerCase().includes(searchText)
    );
  }, [query]);

  if (!open)
    return (
      <button
        onClick={() => onOpenChange(true)}
        className="btn btn-square bg-white"
        title="Help center"
        aria-label="Open help center"
      >
        <RiQuestionFill/>
      </button>
    );

  return (
    <section
      className="w-[360px] h-[520px] max-h-[75vh] flex flex-col text-xs bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
      aria-label="Help center"
      onKeyDown={ev => {
        ev.stopPropagation();

        if (ev.key == "Escape") {
          onOpenChange(false);
        }
      }}
    >
      <header className="flex items-center justify-between gap-2 px-2 h-11 shrink-0 border-b border-gray-200 font-semibold">
        <div className="flex items-center gap-1 min-w-0">
          {
            !page ? <RiQuestionLine className="w-4 h-4 mx-1 shrink-0 text-gray-500"/> : (
              <button
                onClick={() => onPageChange(null)}
                className="p-0.5 rounded-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Back"
              >
                <RiArrowLeftSLine className="w-4 h-4"/>
              </button>
            )
          }

          <h2 className="truncate">{page ? page.title : "Help center"}</h2>
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="p-0.5 rounded-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
          title="Close"
        >
          <RiCloseLine className="w-4 h-4"/>
        </button>
      </header>

      {
        page ? (
          <article className="p-4 overflow-y-auto leading-relaxed">
            {
              !page.category ? <></> : (
                <div className="flex items-center gap-2 mb-3 text-gray-500">
                  { page.icon?.("w-4 h-4") }
                  <span>{page.category}</span>
                </div>
              )
            }

            <div className="[&_p+p]:mt-3 [&_p+ul]:mt-2 [&_ul+p]:mt-2">
              {page.content}
            </div>
          </article>
        ) : (
          <div className="flex flex-col min-h-0">
            <label className="flex items-center gap-2 mx-3 mt-3 px-3 h-9 shrink-0 rounded-field border border-gray-200 text-gray-400 focus-within:border-primary">
              <RiSearchLine className="w-4 h-4 shrink-0"/>
              <input
                ref={searchRef}
                value={query}
                onChange={ev => setQuery(ev.target.value)}
                placeholder="Search guides and nodes…"
                className="w-full outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
                aria-label="Search help"
              />
            </label>

            <div className="overflow-y-auto pb-2">
              {
                query.trim() != "" ? (
                  <ul className="menu menu-sm w-full">
                    {
                      results.length == 0
                        ? <li className="menu-disabled"><span>No matching articles</span></li>
                        : results.map(x => <ArticleLink key={x.title} page={x} onOpen={onPageChange}/>)
                    }
                  </ul>
                ) : <>
                  <ul className="menu menu-sm w-full">
                    <li className="menu-title">Guides</li>
                    { GUIDES.map(x => <ArticleLink key={x.title} page={x} onOpen={onPageChange}/>) }
                  </ul>

                  {
                    NODE_CATEGORIES.map(category => (
                      <ul key={category.name} className="menu menu-sm w-full">
                        <li className="menu-title">{category.name}</li>
                        {
                          NODE_PAGES
                            .filter(x => x.category == category.name)
                            .map(x => <ArticleLink key={x.title} page={x} onOpen={onPageChange}/>)
                        }
                      </ul>
                    ))
                  }
                </>
              }
            </div>
          </div>
        )
      }
    </section>
  );
}
