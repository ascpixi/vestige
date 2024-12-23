import { NATURAL_MIDI_NOTES, SHARP_MIDI_NOTES } from "../audioUtil";
import { range } from "../util"

function isSharp(note: number) {
  return SHARP_MIDI_NOTES.includes(note);
}

export function MusicalKeyboard({ octaves, notes }: {
  /** Amount of octaves to include in the keyboard. */
  octaves: number,

  /** An array of MIDI notes to highlight. All values above `octaves * 12` are ignored. */
  notes: number[]
}) {
  if (notes.some(x => x >= octaves * 12)) {
    console.warn(`Some notes are >= octaves * 12 (${octaves * 12})!`, notes.filter(x => x >= octaves * 12));
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
                  <div key={note} className={`
                    h-full w-full border-r border-gray-300 last:border-r-0
                    ${o.includes(note) ? "bg-primary" : "bg-white"}
                  `}/>
                ))
              }
              </div>

              <div className="w-full h-1/2 justify-around flex row-start-1 col-start-1 ml-[7%]">
              {
                NATURAL_MIDI_NOTES.map(note => (
                  <div key={note} className={
                    `h-full w-1/12 rounded-b-sm
                    ${o.includes(note + 1) ? "bg-primary" : "bg-black"}
                    ${isSharp(note + 1) ? "" : "invisible"}
                  `}/>
                ))
              }
            </div>
          </div>
        )
      }
    </div>
  )
}
