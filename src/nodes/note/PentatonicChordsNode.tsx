import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiMusic2Fill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { NOTE_OUTPUT_HID, NoteGeneratorNodeData, PlainNoteGenerator } from "../../graph";
import { FlatNodeDataSerializer } from "../../serializer";
import { pickRandom, randInt, seedRng } from "../../util";
import { getHarmony, MAJOR_PENTATONIC, MIDI_NOTES, MINOR_PENTATONIC, ScaleMode } from "../../audioUtil";
import { useBoundState, useNoteGeneratorSync } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { SelectField } from "../../components/SelectField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { MusicalKeyboard } from "../../components/MusicalKeyboard";

export class PentatonicChordsGenerator implements PlainNoteGenerator {
  inputs = 0 as const;
  offset: number;
  seedOffset: number;
  lastNotes: number[] = [];

  constructor (
    public chordLength: number = 6,
    public minNotes: number = 4,
    public maxNotes: number = 6,
    public octave: number = 4,
    public pitchRange: number = 12,
    public rootNote: number = MIDI_NOTES.Cs,
    public mode: ScaleMode = "MINOR"
  ) {
    this.offset = Math.random() * 100;
    this.seedOffset = Math.floor(Math.random() * 10000);
  }

  generate(time: number): number[] {
    time = time + this.offset;

    // "available" contains all the notes we can play.
    const scale = this.mode == "MAJOR" ? MAJOR_PENTATONIC : MINOR_PENTATONIC;
    const available = getHarmony(scale, this.rootNote, this.octave, this.pitchRange);

    // We change the seed depending on the "chord length" parameter.
    // https://www.desmos.com/calculator/0dhoqfo8ri (t = chord length)
    // A "t" value of n means that each chord is n seconds long.
    const seed = Math.floor((1 / this.chordLength) * time);
    const rng = seedRng(seed + this.seedOffset);

    // Form the chord from N random notes, between minNotes and maxNotes.
    return this.lastNotes = pickRandom(
      available,
      randInt(this.minNotes, this.maxNotes, rng),
      rng
    );
  }
}

export class PentatonicChordsNodeData extends NoteGeneratorNodeData {
  generator = new PentatonicChordsGenerator();
};

export class PentatonicChordsNodeSerializer extends FlatNodeDataSerializer<PentatonicChordsNodeData> {
  type = "pentatonic-chords";
  dataFactory = () => new PentatonicChordsNodeData();

  spec = {
    l: this.prop(self => self.generator).with("chordLength"),
    a: this.prop(self => self.generator).with("minNotes"),
    b: this.prop(self => self.generator).with("maxNotes"),
    o: this.prop(self => self.generator).with("octave"),
    r: this.prop(self => self.generator).with("pitchRange"),
    n: this.prop(self => self.generator).with("rootNote"),
    m: this.prop(self => self.generator).with("mode"),
  }
}

export type PentatonicChordsNode = flow.Node<PentatonicChordsNodeData, "pentatonic-chords">;

/** Creates a new `PentatonicChordsNode` with a random ID. */
export const createPentatonicChordsNode = makeNodeFactory(
  "pentatonic-chords",
  () => new PentatonicChordsNodeData()
);

/** Provides a `NodeTypeDescriptor` which describes pentatonic chord generator nodes. */
export const PENTATONIC_CHORDS_NODE_DESCRIPTOR = {
  displayName: "chords (pentatonic)",
  icon: cls => <RiMusic2Fill className={cls}/>,
  create: createPentatonicChordsNode
} satisfies NodeTypeDescriptor;

export const PentatonicChordsNodeRenderer = memo(function PentatonicChordsNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<PentatonicChordsNodeData>>
) {
  const gen = data.generator;

  const [rootNote, setRootNote] = useBoundState(gen, "rootNote");
  const [mode, setMode] = useBoundState(gen, "mode");

  const [chordLength, setChordLength] = useBoundState(gen, "chordLength");
  const [minNotes, setMinNotes] = useBoundState(gen, "minNotes");
  const [maxNotes, setMaxNotes] = useBoundState(gen, "maxNotes");
  const [octave, setOctave] = useBoundState(gen, "octave");
  const [pitchRange, setPitchRange] = useBoundState(gen, "pitchRange");

  const notes = useNoteGeneratorSync(() => gen.lastNotes);

  const semitonePitchRange = (mode == "MAJOR" ?
    MAJOR_PENTATONIC[pitchRange % 5] :
    MINOR_PENTATONIC[pitchRange % 5]
  ) + (12 * Math.floor(pitchRange / 5));

  function onMaxNotesChange(x: number) {
    if (x < minNotes) return;
    setMaxNotes(x);
  }

  function onMinNotesChange(x: number) {
    if (x > maxNotes)  return;
    setMinNotes(x);
  }

  function onPitchRangeChange(x: number) {
    if (maxNotes > x) { setMaxNotes(x); }
    if (minNotes > x) { setMinNotes(x); }
    setPitchRange(x);
  }

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="chords (pentatonic)"
      help={<>
        The <b>chords (pentatonic)</b> module generates chords in the pentatonic
        scale, similar to the <b>melody (pentatonic)</b> module. A chord is a
        collection of notes played at the same time for a prolonged period of time.
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
            name="chord length"
            description="the amount of seconds each chord lasts for"
            min={0.125} max={10} value={chordLength} step={0.1}
            valueStringifier={x => `${x.toFixed(2)} s`}
            onChange={setChordLength}
          />

          <SliderField
            name="minimum notes"
            description="the minimum number of notes that can be in a chord"
            min={1} max={pitchRange} value={minNotes}
            onChange={onMinNotesChange}
          />

          <SliderField
            name="maximum notes"
            description="the maximum number of notes that can be in a chord"
            min={1} max={pitchRange} value={maxNotes}
            onChange={onMaxNotesChange}
          />

          <SliderField
            name="pitch range"
            description="amount of intervals we can go beyond the pitch center - basically, how high in pitch we can go."
            min={1} max={24} value={pitchRange}
            onChange={onPitchRangeChange}
          />
          
          <SliderField
            name="octave"
            description="the octave (pitch) center - all notes will be above this pitch"
            min={1} max={6} value={octave}
            onChange={setOctave}
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
