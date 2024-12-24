import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiDropperFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { NOTE_INPUT_HID_MAIN, NOTE_OUTPUT_HID, NoteGeneratorNodeData, ParametricNoteGenerator } from "../graph";
import { assert } from "../util";
import { FlatNodeDataSerializer } from "../serializer";
import { useBoundState } from "../hooks";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SelectField } from "../components/SelectField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

type Mode = "LOWEST" | "HIGHEST";
type NoteInputHandle = typeof NOTE_INPUT_HID_MAIN; // we only accept one note input (the main one)

export class PickNoteGenerator implements ParametricNoteGenerator<NoteInputHandle> {
  inputs = 1 as const;
  mode: Mode = "LOWEST";

  generate(_: number, inputs: Map<NoteInputHandle, number[]>): number[] {
    const input = inputs.get("in-notes-main");
    assert(input, "no 'in-notes-main' input was provided");
    
    if (input.length == 0)
      return [];

    if (this.mode == "LOWEST") {
      return [Math.min(...input)];
    } else {
      return [Math.max(...input)];
    }
  }
}

export class PickNoteNodeData extends NoteGeneratorNodeData<NoteInputHandle> {
  generator: PickNoteGenerator = new PickNoteGenerator();
};

export class PickNoteNodeSerializer extends FlatNodeDataSerializer<PickNoteNodeData> {
  type = "pick-note";
  dataFactory = () => new PickNoteNodeData();

  spec = {
    m: this.prop(self => self.generator).with("mode")
  };
}

export type PickNoteNode = flow.Node<PickNoteNodeData, "pick-note">;

/** Creates a new `PickNoteNode` with a random ID. */
export const createPickNoteNode = makeNodeFactory("pick-note", () => new PickNoteNodeData());

/** Provides a `NodeTypeDescriptor` which describes pick note nodes. */
export const PICK_NOTE_DESCRIPTOR = {
  displayName: "pick note",
  icon: cls => <RiDropperFill className={cls}/>,
  create: createPickNoteNode
} satisfies NodeTypeDescriptor;

export const PickNoteNodeRenderer = memo(function PickNoteNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<PickNoteNodeData>>
) {
  const [mode, setMode] = useBoundState(data.generator, "mode");

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="pick note"
      help={<>
        The <b>pick note</b> module picks a single note from a potentially infinite
        number of incoming notes. It's useful for getting root (bass) notes of chords,
        for example.
      </>}
    >
      <div className="flex flex-col gap-6 w-full">
        <NodePort nodeId={id} handleId={NOTE_INPUT_HID_MAIN} kind="input" type="notes">
          <PlainField
            name="main input"
            description="the notes to pick from"
          />
        </NodePort>

        <NodePort nodeId={id} handleId={NOTE_OUTPUT_HID} kind="output" type="notes">
          <PlainField align="right"
            name="main output"
            description="the single note that we picked"
          />
        </NodePort>

        <SelectField
          name="mode"
          description="which note should we pick? (in pitch)"
          value={mode} onChange={x => setMode(x as Mode)} 
        >
          <option value="LOWEST">lowest</option>
          <option value="HIGHEST">highest</option>
        </SelectField>
      </div>
    </VestigeNodeBase>
  );
});
