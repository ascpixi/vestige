import { Node } from "@xyflow/react";

import { NodeType } from "../graph";
import { uniqueId } from "../util";
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
    LfoNode |
    MixNode |
    BalanceNode |
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
    "lfo": LfoNodeRenderer,
    "mix": MixNodeRenderer,
    "balance": BalanceNodeRenderer,
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
    new LfoNodeSerializer(),
    new MixNodeSerializer(),
    new BalanceNodeSerializer(),
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

/**
 * Returns a function that can create a node at the specified coordinates, with
 * the given node type and data storage type.
 * 
 *      // Creates a new `PentatonicMelodyNode` with a random ID.
 *      export const createPentatonicMelodyNode = makeNodeFactory(
 *          "pentatonic-melody",
 *           () => new PentatonicMelodyNodeData()
 *      );
 */
export function makeNodeFactory<
    TData extends Record<string, unknown>,
    TNodeType extends string
>(
    type: TNodeType,
    dataFactory: () => TData
) {
    return (x: number, y: number, additional?: Partial<VestigeNode>) => createNode(
        type, dataFactory(), x, y, additional
    );
}

/**
 * Similar to `makeNodeFactory`, but returns an asynchronous function instead.
 */
export function makeAsyncNodeFactory<
    TData extends Record<string, unknown>,
    TNodeType extends string
>(
    type: TNodeType,
    dataFactory: () => Promise<TData>
) {
    return async (x: number, y: number, additional?: Partial<VestigeNode>) => createNode(
        type, await dataFactory(), x, y, additional
    );
}

/**
 * Creates a new arbitrary node with a random ID. This function is meant to
 * be called from wrappers which provide known values for `type` and `data`.
 */
export function createNode<TData extends Record<string, unknown>, TNodeType extends string>(
    type: TNodeType,
    data: TData,
    x: number,
    y: number,
    additional?: Partial<VestigeNode>,
): Node<TData, TNodeType> {
    return {
        id: uniqueId(),
        position: { x, y },
        ...additional,

        type: type,
        data: data
    };
}
