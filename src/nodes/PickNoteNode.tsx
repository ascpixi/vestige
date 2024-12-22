import { memo, useEffect, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { RiDropperFill } from "@remixicon/react";

import { makeNodeFactory, NodeTypeDescriptor } from ".";
import { NOTE_INPUT_HID_MAIN, NOTE_OUTPUT_HID, NoteGeneratorNodeData, ParametricNoteGenerator } from "../graph";
import { assert } from "../util";
import { NodeDataSerializer } from "../serializer";

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

export class PickNoteNodeSerializer implements NodeDataSerializer<PickNoteNodeData> {
  type = "pick-note"

  serialize(obj: PickNoteNodeData) {
    return { m: obj.generator.mode };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): PickNoteNodeData {
    const data = new PickNoteNodeData();
    data.generator.mode = serialized.m;
    return data;
  }
}

export type PickNoteNode = Node<PickNoteNodeData, "pick-note">;

/** Creates a new `PickNoteNode` with a random ID. */
export const createPickNoteNode = makeNodeFactory("pick-note", () => new PickNoteNodeData());

/** Provides a `NodeTypeDescriptor` which describes pick note nodes. */
export const PICK_NOTE_DESCRIPTOR = {
  displayName: "pick note",
  icon: cls => <RiDropperFill className={cls}/>,
  create: createPickNoteNode
} satisfies NodeTypeDescriptor;

export const PickNoteNodeRenderer = memo(function PickNoteNodeRenderer(
  { id, data }: NodeProps<Node<PickNoteNodeData>>
) {
  const [mode, setMode] = useState<Mode>(data.generator.mode);

  useEffect(() => {
    data.generator.mode = mode;
  }, [data.generator, mode])

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
