import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiMusic2Fill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { NOTE_OUTPUT_HID, NoteGeneratorNodeData, PlainNoteGenerator } from "../../graph";
import { FlatNodeDataSerializer } from "../../serializer";
import { pickRandom, randInt, seedRng } from "../../util";
import { getHarmony, MAJOR_PENTATONIC, MIDI_NOTES, MINOR_PENTATONIC, ScaleMode } from "../../audioUtil";
import { useBoundState, useNoteGeneratorSync, useTempoSync } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { SelectField } from "../../components/SelectField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { MusicalKeyboard } from "../../components/MusicalKeyboard";
import { DEFAULT_BPM, divisionLength } from "../../transport";
import { DivisionField, SyncToggle } from "../../components/TempoSync";

export class PentatonicChordsGenerator implements PlainNoteGenerator {
  inputs = 0 as const;
  offset: number;
  seedOffset: number;
  lastNotes: number[] = [];
  sync = false;
  division = "1bar";
  bpm = DEFAULT_BPM;

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

  /** The length of a single chord, in seconds. */
  get length() {
    return this.sync ? divisionLength(this.division, this.bpm) : this.chordLength;
  }

  generate(time: number): number[] {
    // When synced, chords have to change exactly on the grid - we can't offset the time.
    if (!this.sync) {
      time = time + this.offset;
    }

    // "available" contains all the notes we can play.
    const scale = this.mode == "MAJOR" ? MAJOR_PENTATONIC : MINOR_PENTATONIC;
    const available = getHarmony(scale, this.rootNote, this.octave, this.pitchRange);

    // We change the seed depending on the "chord length" parameter.
    // https://www.desmos.com/calculator/0dhoqfo8ri (t = chord length)
    // A "t" value of n means that each chord is n seconds long.
    const seed = Math.floor((1 / this.length) * time);
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
    y: this.prop(self => self.generator).with("sync", false), // since Vestige 0.6.0
    v: this.prop(self => self.generator).with("division", "1bar"), // since Vestige 0.6.0
    t: this.prop(self => self.generator).with("bpm", DEFAULT_BPM), // since Vestige 0.6.0
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
  displayName: "Pentatonic Chords",
  icon: cls => <RiMusic2Fill className={cls}/>,
  help: <>
    The <b>pentatonic chords</b> node generates chords in the pentatonic scale, similar to
    the <b>pentatonic melody</b> node. A chord is a collection of notes played at the same time
    for a prolonged period of time.
  </>,
  create: createPentatonicChordsNode
} satisfies NodeTypeDescriptor;

export const PentatonicChordsNodeRenderer = memo(function PentatonicChordsNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<PentatonicChordsNodeData>>
) {
  const gen = data.generator;

  const [rootNote, setRootNote] = useBoundState(gen, "rootNote");
  const [mode, setMode] = useBoundState(gen, "mode");

  const [chordLength, setChordLength] = useBoundState(gen, "chordLength");
  const { sync, onSyncChange, division, setDivision, bpm, setBpm } = useTempoSync(
    gen,
    () => chordLength
  );

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
      name="Pentatonic Chords"
      help={PENTATONIC_CHORDS_NODE_DESCRIPTOR.help}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={NOTE_OUTPUT_HID} kind="output" type="notes">
            <PlainField align="right"
              name="notes"
            />
          </NodePort>

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              name="key"
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
              name="scale"
              value={mode} onChange={x => setMode(x as ScaleMode)}
            >
              <option value="MAJOR">major</option>
              <option value="MINOR">minor</option>
            </SelectField>
          </div>

          {
            sync ? (
              <DivisionField
                name="length"
                value={division} onChange={setDivision}
                bpm={bpm} onBpmChange={setBpm}
                onSyncedChange={onSyncChange}
                minBeats={1}
              />
            ) : (
              <SliderField
                name="length"
                min={0.125} max={10} value={chordLength} step={0.1}
                valueStringifier={x => `${x.toFixed(2)} s`}
                onChange={setChordLength}
                headerAccessory={<SyncToggle synced={false} onChange={onSyncChange}/>}
              />
            )
          }

          <SliderField
            name="min notes"
            min={1} max={pitchRange} value={minNotes}
            onChange={onMinNotesChange}
          />

          <SliderField
            name="max notes"
            min={1} max={pitchRange} value={maxNotes}
            onChange={onMaxNotesChange}
          />

          <SliderField
            name="range"
            min={1} max={24} value={pitchRange}
            onChange={onPitchRangeChange}
          />
          
          <SliderField
            name="octave"
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
