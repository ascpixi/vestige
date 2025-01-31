import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiDice3Fill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { NOTE_INPUT_HID_MAIN, NOTE_OUTPUT_HID, NoteGeneratorNodeData, ParametricNoteGenerator } from "../../graph";
import { assert, match } from "../../util";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState, useNoteGeneratorSync } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SelectField } from "../../components/SelectField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { SliderField } from "../../components/SliderField";
import { MusicalKeyboard } from "../../components/MusicalKeyboard";

const MIN_SPEED = 0.05;
const MAX_SPEED = 2;

type Style = "UP" | "DOWN" | "RANDOM";
type NoteInputHandle = typeof NOTE_INPUT_HID_MAIN; // we only accept one note input (the main one)

function fract(x: number) {
  return x - Math.floor(x);
}

export class ArpeggiatorGenerator implements ParametricNoteGenerator<NoteInputHandle> {
  inputs = 1 as const;
  style: Style = "UP";
  speed = 0.25;
  lastNotes: number[] = [];

  generate(time: number, inputs: Map<NoteInputHandle, number[]>): number[] {
    let input = inputs.get("in-notes-main");
    assert(input, "no 'in-notes-main' input was provided");
    
    if (input.length == 0)
      return [];

    input = [...input].sort((a, b) => a - b);
    const n = input.length;

    // https://www.desmos.com/calculator/rgyhezrleq
    let idx = match(this.style, {
      "UP": Math.floor(((1 / this.speed) * time)) % n,
      "DOWN": -Math.floor(((1 / this.speed) * time) % n) + (n - 1),
      "RANDOM": Math.floor(
        fract(
          Math.sin(Math.floor(time / this.speed))
          * (Math.sin((Math.floor(time / 64) + 1) * 456.341) * 456735.4352)
        )
        * n
      )
    });

    return this.lastNotes = [input[idx]];
  }
}

export class ArpeggiatorNodeData extends NoteGeneratorNodeData<NoteInputHandle> {
  generator = new ArpeggiatorGenerator();
};

export class ArpeggiatorNodeSerializer extends FlatNodeDataSerializer<ArpeggiatorNodeData> {
  type = "arpeggiator";
  dataFactory = () => new ArpeggiatorNodeData();

  spec = {
    m: this.prop(self => self.generator).with("style"),
    s: this.prop(self => self.generator).with("speed")
  };
}

export type ArpeggiatorNode = flow.Node<ArpeggiatorNodeData, "arpeggiator">;

/** Creates a new `ArpeggiatorNode` with a random ID. */
export const createArpeggiatorNode = makeNodeFactory("arpeggiator", () => new ArpeggiatorNodeData());

/** Provides a `NodeTypeDescriptor` which describes arpeggiator nodes. */
export const ARPEGGIATOR_NOTE_DESCRIPTOR = {
  displayName: "arpeggiator",
  icon: cls => <RiDice3Fill className={cls}/>,
  create: createArpeggiatorNode
} satisfies NodeTypeDescriptor;

export const ArpeggiatorNodeRenderer = memo(function ArpeggiatorNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ArpeggiatorNodeData>>
) {
  const [style, setStyle] = useBoundState(data.generator, "style");
  const [speed, setSpeed] = useBoundState(data.generator, "speed");

  const notes = useNoteGeneratorSync(() => data.generator.lastNotes);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="arpeggiator"
      help={<>
        The <b>arpeggiator</b> module breaks down a chord into individual notes, creating
        what is commonly called an <b>arpeggio</b>. With the <b>up</b> and <b>down</b>
        arpeggiation styles, this is done by playing each note in the chord in an ascending
        or descending fashion.
      </>}
    >
      <div className="flex flex-col gap-6 w-full">
        <NodePort nodeId={id} handleId={NOTE_INPUT_HID_MAIN} kind="input" type="notes">
          <PlainField
            name="main input"
            description="the chords to play the individual notes of"
          />
        </NodePort>

        <NodePort nodeId={id} handleId={NOTE_OUTPUT_HID} kind="output" type="notes">
          <PlainField align="right"
            name="main output"
            description="the arpeggios created from the input chords"
          />
        </NodePort>

        <SelectField
          name="style"
          description="the manner the notes of the chord are played"
          value={style} onChange={x => setStyle(x as Style)} 
        >
          <option value="UP">up (ascending)</option>
          <option value="DOWN">down (descending)</option>
          <option value="RANDOM">random</option>
        </SelectField>

        <SliderField
          name="speed"
          description="how fast the notes change - i.e. amount of seconds for each note"
          value={speed} onChange={setSpeed}
          min={MIN_SPEED} max={MAX_SPEED} step={0.01}
          valueStringifier={x => `${x.toFixed(2)} s`}
        />

        <MusicalKeyboard octaves={5} notes={notes.map(x => x - 24)} />
      </div>
    </VestigeNodeBase>
  );
});
