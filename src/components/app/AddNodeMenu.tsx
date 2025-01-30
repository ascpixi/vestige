import { NodeTypeDescriptor } from "../../nodes";
import { ContextMenu, ContextMenuEntry } from "../ContextMenu";

import { PENTATONIC_MELODY_NODE_DESCRIPTOR } from "../../nodes/note/PentatonicMelodyNode";
import { PENTATONIC_CHORDS_NODE_DESCRIPTOR } from "../../nodes/note/PentatonicChordsNode";
import { ARPEGGIATOR_NOTE_DESCRIPTOR } from "../../nodes/note/ArpeggiatorNode";
import { PICK_NOTE_DESCRIPTOR } from "../../nodes/note/PickNoteNode";

import { SYNTH_NODE_DESCRIPTOR } from "../../nodes/instrument/SynthNode";
import { SAMPLER_NODE_DESCRIPTOR } from "../../nodes/instrument/SamplerNode";
import { STEP_SEQ_NODE_DESCRIPTOR } from "../../nodes/instrument/StepSeqNode";

import { FILTER_NODE_DESCRIPTOR } from "../../nodes/effect/FilterNode";
import { REVERB_NODE_DESCRIPTOR } from "../../nodes/effect/ReverbNode";
import { DELAY_NODE_DESCRIPTOR } from "../../nodes/effect/DelayNode";
import { CHORUS_NODE_DESCRIPTOR } from "../../nodes/effect/ChorusNode";
import { PHASER_NODE_DESCRIPTOR } from "../../nodes/effect/PhaserNode";

import { LFO_NODE_DESCRIPTOR } from "../../nodes/LfoNode";
import { MIX_NODE_DESCRIPTOR } from "../../nodes/MixNode";
import { BALANCE_NODE_DESCRIPTOR } from "../../nodes/BalanceNode";
import { MATH_NODE_DESCRIPTOR } from "../../nodes/MathNode";

export function AddNodeMenu({ x, y, show, onNodeChoose }: {
  x: number,
  y: number,
  show: boolean,
  onNodeChoose: (descriptor: NodeTypeDescriptor) => void
}) {
  if (x == 1 && y == 1) {
    // Touch devices seem to report the event originating at (1, 1) - in this
    // case, we position the context menu at the top of the page, centered horizontally.
    x = (document.body.clientWidth / 2) - 150;
    y = 96;
  }

  function getEntry(descriptor: NodeTypeDescriptor): ContextMenuEntry {
    return {
      type: "ITEM",
      content: <div className="flex gap-2 items-center">
        {descriptor.icon("w-4 h-4")}
        {descriptor.displayName}
      </div>,
      onChoose: () => onNodeChoose(descriptor)
    };
  }

  return (
    <div
      style={{ top: y, left: x }}
      className={`absolute z-50 ${show ? "" : "hidden"}`}
    >
      <ContextMenu
          title="add node"
          openSide={x > (document.body.clientWidth * .65) ? "LEFT" : "RIGHT"}
          entries={[
          {
            type: "GROUP", content: "melodies & chords", entries: [
              getEntry(PENTATONIC_MELODY_NODE_DESCRIPTOR),
              getEntry(PENTATONIC_CHORDS_NODE_DESCRIPTOR),
              getEntry(ARPEGGIATOR_NOTE_DESCRIPTOR),
              getEntry(PICK_NOTE_DESCRIPTOR),
            ]
          },
          {
            type: "GROUP", content: "instruments", entries: [
              getEntry(SYNTH_NODE_DESCRIPTOR),
              getEntry(SAMPLER_NODE_DESCRIPTOR),
              getEntry(STEP_SEQ_NODE_DESCRIPTOR)
            ]
          },
          {
            type: "GROUP", content: "effects", entries: [
              getEntry(FILTER_NODE_DESCRIPTOR),
              getEntry(REVERB_NODE_DESCRIPTOR),
              getEntry(DELAY_NODE_DESCRIPTOR),
              getEntry(CHORUS_NODE_DESCRIPTOR),
              getEntry(PHASER_NODE_DESCRIPTOR)
            ]
          },
          getEntry(LFO_NODE_DESCRIPTOR),
          getEntry(MIX_NODE_DESCRIPTOR),
          getEntry(BALANCE_NODE_DESCRIPTOR),
          getEntry(MATH_NODE_DESCRIPTOR)
      ]}/>
    </div>
  )
}