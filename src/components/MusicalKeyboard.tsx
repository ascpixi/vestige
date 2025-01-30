import { NATURAL_MIDI_NOTES, SHARP_MIDI_NOTES } from "../audioUtil";
import { range } from "../util"

function isSharp(note: number) {
  return SHARP_MIDI_NOTES.includes(note);
}

export function MusicalKeyboard({ octaves, notes, interactable, onMouseDown, onMouseUp }: {
  /** Amount of octaves to include in the keyboard. */
  octaves: number,

  /** An array of MIDI notes to highlight. All values above `octaves * 12` are ignored. */
  notes: number[],

  /** If `true`, the keys can be clicked, and will emit `onMouseDown` and `onMouseUp` events. */
  interactable?: boolean,

  /** Called when a key is pressed. `note` is the MIDI note that was pressed. */
  onMouseDown?: (note: number) => void,

  /** Called when a key is released. `note` is the MIDI note that was released. */
  onMouseUp?: (note: number) => void
}) {
  if (notes.some(x => x >= octaves * 12)) {
    console.warn(`Some notes are >= octaves * 12 (${octaves * 12})!`, notes.filter(x => x >= octaves * 12));
  }

  function mouseDownHandler(ev: React.MouseEvent<HTMLElement>, note: number, active = true) {
    ev.stopPropagation();

    if (interactable && active && onMouseDown) {
      onMouseDown(note);
    }
  }

  function mouseUpHandler(ev: React.MouseEvent<HTMLElement>, note: number, active = true) {
    ev.stopPropagation();

    if (interactable && active && onMouseUp) {
      onMouseUp(note);
    }
  }

  return (
    <div className="flex rounded-md overflow-hidden border border-gray-300">
      {
        range(octaves)
          .map(x => notes
            .map(y => y - (x * 12))
            .filter(y => y >= 0 && y < 12)
          )
          .map((o, idx) =>
            <div key={idx} className="grid grid-cols-1 w-full border-r border-gray-300 last:border-r-0">
              <div className="w-full h-16 flex row-start-1 col-start-1">
              {
                NATURAL_MIDI_NOTES.map(note => (
                  <div
                    key={note}
                    onMouseDownCapture={ev => mouseDownHandler(ev, note + (idx * 12))}
                    onMouseUp={ev => mouseUpHandler(ev, note + (idx * 12))}
                    onMouseLeave={ev => mouseUpHandler(ev, note + (idx * 12))}
                    className={`
                      h-full w-full border-r border-gray-300 last:border-r-0
                      ${o.includes(note) ? "bg-primary" : `${interactable ? "hover:bg-gray-300" : ""} bg-white`}
                      ${interactable ? "cursor-pointer" : ""}
                    `}
                  />
                ))
              }
              </div>

              <div className="w-full h-1/2 justify-around flex row-start-1 col-start-1 ml-[7%]">
              {
                NATURAL_MIDI_NOTES.map(note => (
                  <div
                    key={note}
                    onMouseDownCapture={ev => mouseDownHandler(ev, note + 1 + (idx * 12), isSharp(note + 1))}
                    onMouseUp={ev => mouseUpHandler(ev, note + 1 + (idx * 12), isSharp(note + 1))}
                    onMouseLeave={ev => mouseUpHandler(ev, note + 1 + (idx * 12), isSharp(note + 1))}
                    className={
                      `h-full w-1/12 rounded-b-sm
                      ${o.includes(note + 1) ? "bg-primary" : `${interactable ? "hover:bg-gray-700" : ""} bg-black`}
                      ${isSharp(note + 1) ? "" : "invisible"}
                      ${interactable ? "cursor-pointer" : ""}
                    `}
                  />
                ))
              }
            </div>
          </div>
        )
      }
    </div>
  )
}
