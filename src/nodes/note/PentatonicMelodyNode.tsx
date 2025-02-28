import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiMusicFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { NOTE_OUTPUT_HID, NoteGeneratorNodeData, PlainNoteGenerator } from "../../graph";
import { hashify } from "../../util";
import { getHarmony, MAJOR_PENTATONIC, MIDI_NOTES, MINOR_PENTATONIC, ScaleMode } from "../../audioUtil";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState, useNoteGeneratorSync } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { SelectField } from "../../components/SelectField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { MusicalKeyboard } from "../../components/MusicalKeyboard";

export class PentatonicMelodyGenerator implements PlainNoteGenerator {
  inputs = 0 as const;
  offset: number;
  lastNotes: number[] = [];

  constructor (
    public density: number = 50,
    public octave: number = 4,
    public pitchRange: number = 6,
    public polyphony: number = 1,
    public rootNote: number = MIDI_NOTES.Cs,
    public mode: ScaleMode = "MINOR"
  ) {
    this.offset = Math.random() * 100;
  }

  generate(time: number): number[] {
    time = time + this.offset;

    // "available" contains all the notes we can play.
    const scale = this.mode == "MAJOR" ? MAJOR_PENTATONIC : MINOR_PENTATONIC;
    const available = getHarmony(scale, this.rootNote, this.octave, this.pitchRange);

    const played: number[] = [];

    // We treat each available pitch as its own seperate "lane". Each "lane" has
    // its own RNG which determines when it will play. The PRNG itself is
    // completely determinstic. See https://www.desmos.com/calculator/2afzx0iwzs for
    // a visualization of how it works. "d" is the density parameter, 0.0 to 2.0.

    const d = (this.density / 100) * 2;

    for (const note of available) {
      // "z" is an arbitrary variable, which should be random for each "lane".
      // The remainder-of-512 is arbitrary. Looking at the Desmos graph, it seems
      // like the formula works for any 'z'.
      const z = (hashify(note + 0xDEAD) % 4096) / 8;

      const x = time;
      
      const pre = Math.floor(Math.sin((2 * x) + 5*z) + Math.sin((Math.PI * x) + (x / z)) - (1 - d));
      if (pre % 2 === 1) {
        played.push(note);
      }

      if (played.length >= this.polyphony)
        break;
    }

    return this.lastNotes = played;
  }
}

export class PentatonicMelodyNodeData extends NoteGeneratorNodeData {
  generator = new PentatonicMelodyGenerator();
};

export class PentatonicMelodyNodeSerializer extends FlatNodeDataSerializer<PentatonicMelodyNodeData> {
  type = "pentatonic-melody";
  dataFactory = () => new PentatonicMelodyNodeData();

  spec = {
    d: this.prop(self => self.generator).with("density"),
    o: this.prop(self => self.generator).with("octave"),
    r: this.prop(self => self.generator).with("pitchRange"),
    n: this.prop(self => self.generator).with("rootNote"),
    m: this.prop(self => self.generator).with("mode"),
    p: this.prop(self => self.generator).with("polyphony", 1), // since Vestige 0.3.0
  }
}

export type PentatonicMelodyNode = flow.Node<PentatonicMelodyNodeData, "pentatonic-melody">;

/** Creates a new `PentatonicMelodyNode` with a random ID. */
export const createPentatonicMelodyNode = makeNodeFactory(
  "pentatonic-melody",
  () => new PentatonicMelodyNodeData()
);

/** Provides a `NodeTypeDescriptor` which describes pentatonic melody generator nodes. */
export const PENTATONIC_MELODY_NODE_DESCRIPTOR = {
  displayName: "melody (pentatonic)",
  icon: cls => <RiMusicFill className={cls}/>,
  create: createPentatonicMelodyNode
} satisfies NodeTypeDescriptor;

export const PentatonicMelodyNodeRenderer = memo(function PentatonicMelodyNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<PentatonicMelodyNodeData>>
) {
  const gen = data.generator;
  
  const [rootNote, setRootNote] = useBoundState(gen, "rootNote");
  const [mode, setMode] = useBoundState(gen, "mode");

  const [density, setDensity] = useBoundState(gen, "density");
  const [octave, setOctave] = useBoundState(gen, "octave");
  const [pitchRange, setPitchRange] = useBoundState(gen, "pitchRange");
  const [polyphony, setPolyphony] = useBoundState(gen, "polyphony");

  const notes = useNoteGeneratorSync(() => gen.lastNotes);

  const semitonePitchRange = (mode == "MAJOR" ?
    MAJOR_PENTATONIC[pitchRange % 5] :
    MINOR_PENTATONIC[pitchRange % 5]
  ) + (12 * Math.floor(pitchRange / 5));

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="melody (pentatonic)"
      help={<>
        The <b>melody (pentatonic)</b> module generates melodies in the pentatonic
        scale, which has <b>5 intervals</b>. An interval is simply a note in a scale,
        and a scale is a set of notes that sound good together.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={NOTE_OUTPUT_HID} kind="output" type="notes">
            <PlainField align="right"
              name="main output"
              description="the currently held down notes"
            />
          </NodePort>

          <SelectField
            name="root note"
            description="the root of the scale to play in"
            value={rootNote} onChange={x => setRootNote(parseInt(x))} 
          >
            <option value={MIDI_NOTES.C}>C</option>
            <option value={MIDI_NOTES.Cs}>C#</option>
            <option value={MIDI_NOTES.D}>D</option>
            <option value={MIDI_NOTES.Ds}>D#</option>
            <option value={MIDI_NOTES.E}>E</option>
            <option value={MIDI_NOTES.F}>F</option>
            <option value={MIDI_NOTES.Fs}>F#</option>
            <option value={MIDI_NOTES.G}>G</option>
            <option value={MIDI_NOTES.Gs}>G#</option>
            <option value={MIDI_NOTES.A}>A</option>
            <option value={MIDI_NOTES.As}>A#</option>
            <option value={MIDI_NOTES.B}>B</option>
          </SelectField>

          <SelectField
            name="scale mode"
            description="minor usually sounds more mellow than major - in western music theory"
            value={mode} onChange={x => setMode(x as ScaleMode)}
          >
            <option value="MAJOR">major</option>
            <option value="MINOR">minor</option>
          </SelectField>

          <SliderField
            name="density"
            description="amount of notes to play at any given time"
            min={0} max={100} value={density} isPercentage
            onChange={setDensity}
          />

          <SliderField
            name="octave"
            description="the octave (pitch) center - all notes will be above this pitch"
            min={1} max={6} value={octave}
            onChange={setOctave}
          />

          <SliderField
            name="pitch range"
            description="amount of intervals we can go beyond the pitch center - basically, how high in pitch we can go."
            min={1} max={10} value={pitchRange}
            onChange={setPitchRange}
          />

          <SliderField
            name="polyphony"
            description="amount of notes that can be played at the same time"
            min={1} max={4} value={polyphony}
            onChange={setPolyphony}
          />

          <MusicalKeyboard
            octaves={Math.ceil((semitonePitchRange + rootNote) / 12)}
            notes={notes.map(x => x - (octave * 12))}
          />
        </div>
      </div>
    </VestigeNodeBase>
  );
});
