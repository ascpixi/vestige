import { NodeType } from "../graph";
import { NodeDataSerializer } from "../serializer";

import { FinalNode, FinalNodeRenderer, FinalNodeSerializer } from "./FinalNode";
import { LfoNode, LfoNodeRenderer, LfoNodeSerializer } from "./LfoNode";
import { MixNode, MixNodeRenderer, MixNodeSerializer } from "./MixNode";
import { BalanceNode, BalanceNodeRenderer, BalanceNodeSerializer } from "./BalanceNode";
import { MathNode, MathNodeRenderer, MathNodeSerializer } from "./MathNode";

import { ChorusNode, ChorusNodeRenderer, ChorusNodeSerializer } from "./effect/ChorusNode";
import { FilterNode, FilterNodeRenderer, FilterNodeSerializer } from "./effect/FilterNode";
import { ReverbNode, ReverbNodeRenderer, ReverbNodeSerializer } from "./effect/ReverbNode";
import { ShimmerNode, ShimmerNodeRenderer, ShimmerNodeSerializer } from "./effect/ShimmerNode";
import { PhaserNode, PhaserNodeRenderer, PhaserNodeSerializer } from "./effect/PhaserNode";
import { DelayNode, DelayNodeRenderer, DelayNodeSerializer } from "./effect/DelayNode";
import { StereoWidenerNode, StereoWidenerNodeRenderer, StereoWidenerNodeSerializer } from "./effect/StereoWidenerNode";

import { PentatonicMelodyNodeRenderer, PentatonicMelodyNode, PentatonicMelodyNodeSerializer } from "./note/PentatonicMelodyNode";
import { PentatonicChordsNode, PentatonicChordsNodeRenderer, PentatonicChordsNodeSerializer } from "./note/PentatonicChordsNode";
import { ArpeggiatorNode, ArpeggiatorNodeRenderer, ArpeggiatorNodeSerializer } from "./note/ArpeggiatorNode";
import { PickNoteNode, PickNoteNodeRenderer, PickNoteNodeSerializer } from "./note/PickNoteNode";

import { SynthNodeRenderer, SynthNode, SynthNodeSerializer } from "./instrument/SynthNode";
import { SamplerNode, SamplerNodeRenderer, SamplerNodeSerializer } from "./instrument/SamplerNode";
import { StepSeqNode, StepSeqNodeRenderer, StepSeqNodeSerializer } from "./instrument/StepSeqNode";
import { KeyboardNode, KeyboardNodeRenderer, KeyboardNodeSerializer } from "./note/KeyboardNode";

/** Represents any kind of node (module) provided by Vestige. */
export type VestigeNode =
    PentatonicMelodyNode |
    PentatonicChordsNode |
    ArpeggiatorNode |
    PickNoteNode |
    KeyboardNode |

    StepSeqNode |
    SamplerNode |
    SynthNode |

    FilterNode |
    ReverbNode |
    DelayNode |
    ChorusNode |
    PhaserNode |
    ShimmerNode |
    StereoWidenerNode |
    
    LfoNode |
    MixNode |
    BalanceNode |
    MathNode |
    
    FinalNode;

/**
 * Represents a `VestigeNode` that has a `data.nodeType` field equal to `T`.
 */
export type VestigeNodeOfType<T extends NodeType> = VestigeNode & {
    data: {
        nodeType: T;
    }
};
    
export const VESTIGE_NODE_TYPES = {
    "pentatonic-melody": PentatonicMelodyNodeRenderer,
    "pentatonic-chords": PentatonicChordsNodeRenderer,
    "arpeggiator": ArpeggiatorNodeRenderer,
    "pick-note": PickNoteNodeRenderer,
    "keyboard": KeyboardNodeRenderer,
    
    "synth": SynthNodeRenderer,
    "sampler": SamplerNodeRenderer,
    "step-seq": StepSeqNodeRenderer,

    "filter": FilterNodeRenderer,
    "reverb": ReverbNodeRenderer,
    "shimmer": ShimmerNodeRenderer,
    "delay": DelayNodeRenderer,
    "chorus": ChorusNodeRenderer,
    "phaser": PhaserNodeRenderer,
    "stereo-widener": StereoWidenerNodeRenderer,

    "lfo": LfoNodeRenderer,
    "mix": MixNodeRenderer,
    "balance": BalanceNodeRenderer,
    "math": MathNodeRenderer,

    "final": FinalNodeRenderer
};

export const VESTIGE_NODE_SERIALIZERS: NodeDataSerializer<any>[] = [
    new PentatonicMelodyNodeSerializer(),
    new PentatonicChordsNodeSerializer(),
    new ArpeggiatorNodeSerializer(),
    new PickNoteNodeSerializer(),
    new KeyboardNodeSerializer(),

    new SynthNodeSerializer(),
    new SamplerNodeSerializer(),
    new StepSeqNodeSerializer(),

    new FilterNodeSerializer(),
    new ReverbNodeSerializer(),
    new ShimmerNodeSerializer(),
    new DelayNodeSerializer(),
    new ChorusNodeSerializer(),
    new PhaserNodeSerializer(),
    new StereoWidenerNodeSerializer(),

    new LfoNodeSerializer(),
    new MixNodeSerializer(),
    new BalanceNodeSerializer(),
    new MathNodeSerializer(),

    new FinalNodeSerializer()
];

/**
 * Provides information about a node type that can be used to created it and
 * display its metadata to the user.
 */
export interface NodeTypeDescriptor {
    /**
     * A user-friendly name of the node. Displayed in the node selector.
     */
    displayName: string;

    /**
     * Gets an icon marked with the given classes to display alongside the `displayName`.
     */
    icon: (className: string) => React.ReactNode;

    /**
     * Creates a new node object of the node type this `NodeTypeDescriptor`
     * describes at the given position.
     */
    create(x: number, y: number): VestigeNode | Promise<VestigeNode>;
}
