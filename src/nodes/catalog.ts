import { NodeTypeDescriptor } from ".";

import { PENTATONIC_MELODY_NODE_DESCRIPTOR } from "./note/PentatonicMelodyNode";
import { PENTATONIC_CHORDS_NODE_DESCRIPTOR } from "./note/PentatonicChordsNode";
import { ARPEGGIATOR_NOTE_DESCRIPTOR } from "./note/ArpeggiatorNode";
import { PICK_NOTE_DESCRIPTOR } from "./note/PickNoteNode";
import { KEYBOARD_NODE_DESCRIPTOR } from "./note/KeyboardNode";

import { SYNTH_NODE_DESCRIPTOR } from "./instrument/SynthNode";
import { SAMPLER_NODE_DESCRIPTOR } from "./instrument/SamplerNode";
import { STEP_SEQ_NODE_DESCRIPTOR } from "./instrument/StepSeqNode";

import { FILTER_NODE_DESCRIPTOR } from "./effect/FilterNode";
import { REVERB_NODE_DESCRIPTOR } from "./effect/ReverbNode";
import { SHIMMER_NODE_DESCRIPTOR } from "./effect/ShimmerNode";
import { DELAY_NODE_DESCRIPTOR } from "./effect/DelayNode";
import { CHORUS_NODE_DESCRIPTOR } from "./effect/ChorusNode";
import { PHASER_NODE_DESCRIPTOR } from "./effect/PhaserNode";
import { STEREO_WIDENER_NODE_DESCRIPTOR } from "./effect/StereoWidenerNode";

import { LFO_NODE_DESCRIPTOR } from "./LfoNode";
import { MATH_NODE_DESCRIPTOR } from "./MathNode";

import { MIX_NODE_DESCRIPTOR } from "./MixNode";
import { BALANCE_NODE_DESCRIPTOR } from "./BalanceNode";

/** Represents a category of nodes, as displayed in the add menu and help center. */
export interface NodeCategory {
    name: string;
    entries: NodeTypeDescriptor[];
}

/** All nodes that can be created by the user, grouped by category. */
export const NODE_CATEGORIES: NodeCategory[] = [
    {
        name: "Notes",
        entries: [
            PENTATONIC_MELODY_NODE_DESCRIPTOR,
            PENTATONIC_CHORDS_NODE_DESCRIPTOR,
            ARPEGGIATOR_NOTE_DESCRIPTOR,
            PICK_NOTE_DESCRIPTOR,
            KEYBOARD_NODE_DESCRIPTOR
        ]
    },
    {
        name: "Instruments",
        entries: [
            SYNTH_NODE_DESCRIPTOR,
            SAMPLER_NODE_DESCRIPTOR,
            STEP_SEQ_NODE_DESCRIPTOR
        ]
    },
    {
        name: "Effects",
        entries: [
            FILTER_NODE_DESCRIPTOR,
            REVERB_NODE_DESCRIPTOR,
            SHIMMER_NODE_DESCRIPTOR,
            DELAY_NODE_DESCRIPTOR,
            CHORUS_NODE_DESCRIPTOR,
            PHASER_NODE_DESCRIPTOR,
            STEREO_WIDENER_NODE_DESCRIPTOR
        ]
    },
    {
        name: "Modulation",
        entries: [
            LFO_NODE_DESCRIPTOR,
            MATH_NODE_DESCRIPTOR
        ]
    },
    {
        name: "Utility",
        entries: [
            MIX_NODE_DESCRIPTOR,
            BALANCE_NODE_DESCRIPTOR
        ]
    }
];
