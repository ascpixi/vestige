import { memo, useEffect, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { RiMusic2Fill } from "@remixicon/react";

import { makeNodeFactory, NodeTypeDescriptor } from ".";
import { AlwaysEmptyNoteInputs, NoNoteInputs, NOTE_OUTPUT_HID, NoteGenerator, NoteGeneratorNodeData } from "../graph";

import { pickRandom, randInt, seedRng } from "../util";
import { getHarmony, MAJOR_PENTATONIC, MIDI_NOTES, MINOR_PENTATONIC, ScaleMode } from "../audioUtil";

import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SelectField } from "../components/SelectField";
import { NodeDataSerializer } from "../serializer";

export class PentatonicChordsGenerator implements NoteGenerator<NoNoteInputs> {
  inputs: number;
  offset: number;
  seedOffset: number;

  constructor(
    public chordLength: number = 6,
    public minNotes: number = 4,
    public maxNotes: number = 6,
    public octave: number = 4,
    public pitchRange: number = 12,
    public rootNote: number = MIDI_NOTES.Cs,
    public mode: ScaleMode = "MINOR"
  ) {
    this.inputs = 0;
    this.offset = Math.random() * 100;
    this.seedOffset = Math.floor(Math.random() * 10000);
  }

  generate(time: number, _: AlwaysEmptyNoteInputs): number[] {
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
    return pickRandom(
      available,
      randInt(this.minNotes, this.maxNotes, rng),
      rng
    );
  }
}

export class PentatonicChordsNodeData extends NoteGeneratorNodeData<NoNoteInputs> {
  generator: PentatonicChordsGenerator;

  constructor () {
    super();
    this.generator = new PentatonicChordsGenerator();
  }
};

export class PentatonicChordsNodeSerializer implements NodeDataSerializer<PentatonicChordsNodeData> {
  type = "pentatonic-chords"

  serialize(obj: PentatonicChordsNodeData) {
    const gen = obj.generator;

    return {
      l: gen.chordLength,
      a: gen.minNotes,
      b: gen.maxNotes,
      o: gen.octave,
      r: gen.pitchRange,
      n: gen.rootNote,
      m: gen.mode
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): PentatonicChordsNodeData {
    const data = new PentatonicChordsNodeData();
    const gen = data.generator;

    gen.chordLength = serialized.l;
    gen.minNotes = serialized.a;
    gen.maxNotes = serialized.b;
    gen.octave = serialized.o;
    gen.pitchRange = serialized.r;
    gen.rootNote = serialized.n;
    gen.mode = serialized.m;

    return data;
  }
}

export type PentatonicChordsNode = Node<PentatonicChordsNodeData, "pentatonic-chords">;

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
  { id, data }: NodeProps<Node<PentatonicChordsNodeData>>
) {
  const [rootNote, setRootNote] = useState<number>(data.generator.rootNote);
  const [mode, setMode] = useState<ScaleMode>(data.generator.mode);

  const [chordLength, setChordLength] = useState(data.generator.chordLength);
  const [minNotes, setMinNotes] = useState(data.generator.minNotes);
  const [maxNotes, setMaxNotes] = useState(data.generator.maxNotes);
  const [octave, setOctave] = useState(data.generator.octave);
  const [pitchRange, setPitchRange] = useState(data.generator.pitchRange);

  useEffect(() => {
    const gen = data.generator;

    gen.chordLength = chordLength;
    gen.minNotes = minNotes;
    gen.maxNotes = maxNotes;
    gen.rootNote = rootNote;
    gen.mode = mode;
    gen.octave = octave;
    gen.pitchRange = pitchRange;
  }, [data.generator, rootNote, mode, chordLength, minNotes, maxNotes, octave, pitchRange])

  function onMaxNotesChange(x: number) {
    if (x < minNotes)
      return;

    setMaxNotes(x);
  }

  function onMinNotesChange(x: number) {
    if (x > maxNotes)
      return;

    setMinNotes(x);
  }

  function onPitchRangeChange(x: number) {
    if (maxNotes > x) {
      setMaxNotes(x);
    }

    if (minNotes > x) {
      setMinNotes(x);
    }

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
          <NodePort offset={20} handleId={NOTE_OUTPUT_HID} kind="output" type="notes">
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
        </div>
      </div>
    </VestigeNodeBase>
  );
});
