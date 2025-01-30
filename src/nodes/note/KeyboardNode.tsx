import * as flow from "@xyflow/react";
import { memo, useState } from "react";
import { RiCursorFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { NOTE_OUTPUT_HID, NoteGeneratorNodeData, PlainNoteGenerator } from "../../graph";
import { NullNodeDataSerializer } from "../../serializer";
import { includeUnique } from "../../util";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { MusicalKeyboard } from "../../components/MusicalKeyboard";
import { SliderField } from "../../components/SliderField";

export class KeyboardGenerator implements PlainNoteGenerator {
  inputs = 0 as const;
  heldNotes: number[] = [];

  generate(_: number): number[] {
    return [...this.heldNotes];
  }
}

export class KeyboardNodeData extends NoteGeneratorNodeData {
  generator = new KeyboardGenerator();
};

export class KeyboardNodeSerializer extends NullNodeDataSerializer<KeyboardNodeData> {
  type = "keyboard";
  make() { return new KeyboardNodeData(); } 
}

export type KeyboardNode = flow.Node<KeyboardNodeData, "keyboard">;

/** Creates a new `KeyboardNode` with a random ID. */
export const createKeyboardNode = makeNodeFactory(
  "keyboard",
  () => new KeyboardNodeData()
);

/** Provides a `NodeTypeDescriptor` which describes keyboard (manual) nodes. */
export const KEYBOARD_NODE_DESCRIPTOR = {
  displayName: "keyboard (manual)",
  icon: cls => <RiCursorFill className={cls}/>,
  create: createKeyboardNode
} satisfies NodeTypeDescriptor;

export const KeyboardNodeRenderer = memo(function KeyboardNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<KeyboardNodeData>>
) {
  const gen = data.generator;

  const [notes, setNotes] = useState<number[]>([]);
  const [octave, setOctave] = useState(2);
  const [midiConnected, setMidiConnected] = useState(false);
  const [midiInputs, setMidiInputs] = useState<MIDIInputMap | null>(null);

  function onNoteMouseDown(note: number) {
    onNoteDown(note + (octave * 12));
  }

  function onNoteDown(note: number) {
    setNotes(notes => gen.heldNotes = includeUnique(notes, note));
  }

  function onNoteMouseUp(note: number) {
    onNoteUp(note + (octave * 12));
  }

  function onNoteUp(note: number) {
    setNotes(notes => gen.heldNotes = notes.filter(x => x != note));
  }

  async function connectMidi() {
    const midiAccess = await navigator.requestMIDIAccess();

    for (const input of midiAccess.inputs.values()) {
      input.onmidimessage = (event) => {
        if (!event.data || event.data.length < 3)
          return;
        
        const status = event.data[0];
        const note = event.data[1];
        const velocity = event.data[2];

        if ((status & 0xf0) !== 0x90)
          return;

        if (velocity != 0) {
          onNoteDown(note);
        } else {
          onNoteUp(note);
        }
      };
    } 

    setMidiInputs(midiAccess.inputs);
    setMidiConnected(true);
  }

  function dispose() {
    if (midiConnected && midiInputs) {
      for (const input of midiInputs.values()) {
        input.onmidimessage = null;
      }
    }
  }

  return (
    <VestigeNodeBase
      id={id} onRemove={dispose}
      name="keyboard (manual)"
      help={<>
        The <b>keyboard (manual)</b> module exposes the ability to manually input
        notes, by either clicking on the keys manually, or by connecting a MIDI keyboard.
      </>}
    >
      <div className="flex flex-col gap-6 w-full">
        <NodePort nodeId={id} handleId={NOTE_OUTPUT_HID} kind="output" type="notes">
          <PlainField align="right"
            name="main output"
            description="the currently held down notes"
          />
        </NodePort>

        <SliderField
          name="octave"
          description="the base octave of the keyboard"
          value={octave} onChange={setOctave}
          min={1} max={4}
        />

        <button className="btn" disabled={midiConnected} onClick={connectMidi}>
          { !midiConnected ? "Connect MIDI" : "MIDI connected" }
        </button>

        <MusicalKeyboard
          octaves={3}
          notes={notes.map(x => x - (octave * 12))}
          interactable={true}
          onMouseDown={onNoteMouseDown}
          onMouseUp={onNoteMouseUp}
        />
      </div>
    </VestigeNodeBase>
  );
});
