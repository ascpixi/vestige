import { NodeType } from "../graph";
import { NodeDataSerializer } from "../serializer";

import { PentatonicMelodyNodeRenderer, PentatonicMelodyNode, PentatonicMelodyNodeSerializer } from "./PentatonicMelodyNode";
import { PentatonicChordsNode, PentatonicChordsNodeRenderer, PentatonicChordsNodeSerializer } from "./PentatonicChordsNode";
import { FilterNode, FilterNodeRenderer, FilterNodeSerializer } from "./FilterNode";
import { ReverbNode, ReverbNodeRenderer, ReverbNodeSerializer } from "./ReverbNode";
import { DelayNode, DelayNodeRenderer, DelayNodeSerializer } from "./DelayNode";
import { SynthNodeRenderer, SynthNode, SynthNodeSerializer } from "./SynthNode";
import { FinalNode, FinalNodeRenderer, FinalNodeSerializer } from "./FinalNode";
import { LfoNode, LfoNodeRenderer, LfoNodeSerializer } from "./LfoNode";
import { MixNode, MixNodeRenderer, MixNodeSerializer } from "./MixNode";
import { BalanceNode, BalanceNodeRenderer, BalanceNodeSerializer } from "./BalanceNode";
import { SamplerNode, SamplerNodeRenderer, SamplerNodeSerializer } from "./SamplerNode";
import { PickNoteNode, PickNoteNodeRenderer, PickNoteNodeSerializer } from "./PickNoteNode";
import { ChorusNode, ChorusNodeRenderer, ChorusNodeSerializer } from "./ChorusNode";
import { ArpeggiatorNode, ArpeggiatorNodeRenderer, ArpeggiatorNodeSerializer } from "./ArpeggiatorNode";

export type NodeData = {
    type: NodeType
};

/** Represents any kind of node (module) provided by Vestige. */
export type VestigeNode =
    PentatonicMelodyNode |
    PentatonicChordsNode |
    SynthNode |
    SamplerNode |
    FilterNode |
    ReverbNode |
    DelayNode |
    ChorusNode |
    LfoNode |
    MixNode |
    BalanceNode |
    PickNoteNode |
    ArpeggiatorNode |
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
    "synth": SynthNodeRenderer,
    "sampler": SamplerNodeRenderer,
    "filter": FilterNodeRenderer,
    "reverb": ReverbNodeRenderer,
    "delay": DelayNodeRenderer,
    "chorus": ChorusNodeRenderer,
    "lfo": LfoNodeRenderer,
    "mix": MixNodeRenderer,
    "balance": BalanceNodeRenderer,
    "pick-note": PickNoteNodeRenderer,
    "arpeggiator": ArpeggiatorNodeRenderer,
    "final": FinalNodeRenderer
};

export const VESTIGE_NODE_SERIALIZERS: NodeDataSerializer<any>[] = [
    new PentatonicMelodyNodeSerializer(),
    new PentatonicChordsNodeSerializer(),
    new SynthNodeSerializer(),
    new SamplerNodeSerializer(),
    new FilterNodeSerializer(),
    new ReverbNodeSerializer(),
    new DelayNodeSerializer(),
    new ChorusNodeSerializer(),
    new LfoNodeSerializer(),
    new MixNodeSerializer(),
    new BalanceNodeSerializer(),
    new PickNoteNodeSerializer(),
    new ArpeggiatorNodeSerializer(),
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
