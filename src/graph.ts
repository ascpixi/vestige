import * as tone from "tone";
import * as flow from "@xyflow/react";

import { VestigeNodeOfType } from "./nodes";
import { midiToName } from "./audioUtil";
import { Automatable } from "./parameters";
import { assert, mapFromSingle } from "./util";
import { FinalNodeData } from "./nodes/FinalNode";

export type NoteEventType = "NOTE_ON" | "NOTE_OFF";

/**
 * Represents a discrete note event. The note-to-instrument forwarder (`NoteForwarder`)
 * converts constant note data to discrete note events, which are accepted by
 * `AudioGenerator` objects.
 */
export interface NoteEvent {
    type: NoteEventType;
    pitch: number;
}

/**
 * The type of a Vestige node. This enumeration is used to distinguish the
 * available members of node data objects.
 */
export type NodeType = "NOTES" | "INSTRUMENT" | "EFFECT" | "FINAL" | "VALUE";

/**
 * Represents the base type for all node data types. This also allows for
 * node data types to be implemented as interfaces instead of type aliases.
 */
export type BaseNodeData = Record<string, unknown> & {
    /**
     * The type of the node. This determines what the node will return.
     */
    nodeType: NodeType;
};

/**
 * Represents the data of a node that can generate notes. Such nodes
 * participate in the note-to-instrument graph.
 */
export abstract class NoteGeneratorNodeData<TParamType extends string = string> implements BaseNodeData {
    [x: string]: unknown;

    nodeType = "NOTES" as const;
    abstract generator: PlainNoteGenerator | ParametricNoteGenerator<TParamType>;
}

/**
 * Represents the data of a node that accept notes and output audio. Such
 * nodes participate in the node-to-instrument graph.
 */
export abstract class InstrumentNodeData implements BaseNodeData {
    [x: string]: unknown;

    nodeType = "INSTRUMENT" as const;
    parameters: { [handleName: string]: Automatable } = {};

    abstract generator: AudioGenerator;
};

/**
 * Represents the data of a node that modifies a given audio signal.
 */
export abstract class EffectNodeData implements BaseNodeData {
    [x: string]: unknown;

    nodeType = "EFFECT" as const;
    parameters: { [handleName: string]: Automatable } = {};

    abstract effect: AudioEffect;
}

/**
 * Represents the data of a value node, which may accept a value, and forward
 * its generated values to the automatable parameters it is connected to.
 */
export abstract class ValueNodeData implements BaseNodeData {
    [x: string]: unknown;

    nodeType = "VALUE" as const;
    abstract generator: ValueGenerator;
}

export type NoInputs<T> = { [paramName in keyof never]: T };

/**
 * Represents a parameter map which is empty, and represents no note inputs.
 */
export type NoNoteInputs = NoInputs<number[]>;

/**
 * Represents the type of the `inputs` parameter of a
 * `NoteGenerator<NoNoteInputs>.generate` function.
 */
export type AlwaysEmptyNoteInputs = Map<keyof NoNoteInputs, number[]>;

/**
 * Represents an object capable of generating note events based on time.
 */
export interface PlainNoteGenerator {
    /**
     * The amount of inputs the generator accepts.
     */
    inputs: 0;

    /**
     * Generates a list of notes (as represented by their MIDI pitches) that
     * should be active at the given `time`. This function should always be
     * implemented as a pure one - that is, it should never modify any non-temporary
     * data, and should always return the exact same output for the same parameters.
     */
    generate(time: number): number[];
}

/**
 * Represents an object capable of generating note events based on time and other
 * note inputs.
 */
export interface ParametricNoteGenerator<TParamType extends string> {
    /**
     * The amount of inputs the generator accepts.
     */
    // We probably won't ever need more than 8 note inputs. We can't use
    // `number` because TypeScript immidiately assumes that every single implementation
    // is a ParametricNoteGenerator (since 0 is also a number), and we can't exclude
    // a single number.
    inputs: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

    /**
     * Generates a list of notes (as represented by their MIDI pitches) that
     * should be active at the given `time`. This function should always be
     * implemented as a pure one - that is, it should never modify any non-temporary
     * data, and should always return the exact same output for the same parameters.
     */
    generate(time: number, inputs: Map<TParamType, number[]>): number[];
}

/**
 * Represents an output that can accept one or more audio inputs.
 */
export interface AudioDestination {
    /**
     * Accepts the given audio input, connecting it to the correct underlying
     * audio output.
     */
    accept(input: tone.ToneAudioNode): void;
}

/**
 * Returns an `AudioDestination` object which calls `(input).connect(output)`
 * when its `accept` method is invoked.
 */
export function unaryAudioDestination(output: tone.InputNode): AudioDestination {
    return {
        accept(input) {
            input.connect(output);
        }
    }
}

/**
 * Represents an object capable of generating audio.
 */
export interface AudioGenerator {
    /**
     * Processes the given note events.
     */
    accept(events: NoteEvent[]): void;

    /**
     * Changes the node this `AudioGenerator` is currently connected to.
     */
    connectTo(dst: AudioDestination): void;

    /**
     * Disconnects this `AudoGenerator` from all Tone.js nodes.
     */
    disconnect(): void;
}

/**
 * Represents an object capable of transforming incoming audio.
 */
export interface AudioEffect {
    /**
     * Changes the audio node this `AudioEffect` is currently connected to - that is,
     * the node that the output of this audio effect flows to.
     */
    connectTo(dst: AudioDestination): void;

    /**
     * Disconnects the audio node this `AudioEffect` is currently connected to,
     * preventing it from providing its output to the previously connected node.
     */
    disconnect(): void;

    /**
     * Gets the connection destination of the given signal input.
     */
    getConnectDestination(handleId: string): AudioDestination;
}

/**
 * Represents an object capable of creating normalized values in the range of 0.0
 * to 1.0.
 */
export interface ValueGenerator {
    /**
     * Gets the value, at the given `time`, of the generator.
     */
    generate(time: number): number;
}

/**
 * Represents an abstract Vestige node. The difference between `VestigeNode` and
 * `AbstractVestigeNode` is that `VestigeNode` will perform type narrowing to
 * actual implemented node types.
 */
export type AbstractVestigeNode = flow.Node<
    NoteGeneratorNodeData | InstrumentNodeData | EffectNodeData | ValueNodeData | FinalNodeData,
    string
>;

/** The handle prefix ID for signal inputs. */
export const SIGNAL_INPUT_HID_PREFIX = "in-signal";

/** The handle ID for main signal inputs. */
export const SIGNAL_INPUT_HID_MAIN = "in-signal-main";

/** The handle ID for main signal outputs. Currently, a node can only return a single entity. */
export const SIGNAL_OUTPUT_HID = "out-signal-main";

/** The handle ID prefix for note inputs. */
export const NOTE_INPUT_HID_PREFIX = "in-notes";

/**
 * The handle ID for note inputs of nodes that only accept one main input - like
 * `INSTRUMENT` nodes.
 */
export const NOTE_INPUT_HID_MAIN = "in-notes-main";

/** The handle ID for note outputs. Currently, a node can only return a single entity. */
export const NOTE_OUTPUT_HID = "out-notes-main";

/** The handle ID for value outputs. Currently, a node can only return a single entity. */
export const VALUE_OUTPUT_HID = "out-value-main";

/** The handle ID for value inputs, or, in otherwords, automatable parameters. */
export const VALUE_INPUT_HID_PREFIX = "param";

/** Equivalent to `${VALUE_INPUT_HID_PREFIX}-${id}` */
export function paramHandleId(id: string) {
    return `${VALUE_INPUT_HID_PREFIX}-${id}`;
}

/** Equivalent to `${NOTE_INPUT_HID_PREFIX}-${id}` */
export function noteInHandleId(id: string) {
    return `${NOTE_INPUT_HID_PREFIX}-${id}`;
}

/** Equivalent to `${SIGNAL_INPUT_HID_PREFIX}-${id}` */
export function signalInHandleId(id: string) {
    return `${SIGNAL_INPUT_HID_PREFIX}-${id}`;
}

// We manually walk the graph on each pulse to have control over the note
// generator functions. For all signal generators, we maintain the connections
// for ToneAudioNode's via React Flow events.
//
// We start with all note generators that accept no inputs. If we encounter
// a signal generator, the note trace is done. However, if we encounter a
// note generator with two inputs, where one input is not yet filled, we
// terminate that trace, and start with the next note generator. If the
// two-input note generator is properly connected (i.e. has both inputs filled),
// the traversals after the early termination will find the two-input note
// generator already filled, and may proceed with the traversal.
//
// For the sake of simplicity, we only accept one-input and two-input note
// generators. N-input note generators are NOT supported.
//
// After we reach a signal generator, we have a ready list of note events.
// We may provide them to said signal generator, which already has a set
// destination, as maintained by React Flow.

/**
 * Gets nodes of the given `type` that have no incoming connections from the
 * given `nodes` and `edges` arrays.
 */
function getRootNodes<T extends NodeType>(
    nodes: AbstractVestigeNode[],
    edges: flow.Edge[],
    type: T
) {
    return nodes.filter(
        x => x.data.nodeType == type && !edges.some(y => y.target == x.id)
    ) as VestigeNodeOfType<T>[];
}

/**
 * Gets all nodes that have incoming connections from `targetNodeId`, given
 * the specified `nodes` and `edges` arrays.
 */
function getConnected(targetNodeId: string, nodes: AbstractVestigeNode[], edges: flow.Edge[]) {
    return edges
        .filter(x => x.source == targetNodeId)
        .map(x => ({
            subEdge: x,
            subNode: nodes.find(y => y.id == x.target)!
        }));
}

/**
 * Maintains the flow of notes to instrument nodes and of generated values to
 * automatable parameters.
 */
export class GraphForwarder {
    // In order to convert continous notes to discrete note events, we
    // compute the difference between the previous and current state of
    // each note-to-instrument connection. If in the diff a note is added,
    // we emit a NOTE_ON event, and if it is removed, we emit a NOTE_OFF event.

    /**
     * For each note generator-to-instrument connection, stores the previous
     * notes (in MIDI pitches) that were active in the previous pulse.
     */
    private prevNoteMap: Map<string, number[]> = new Map();

    /**
     * Traces the given graph, forwarding Vestige-generated data to out-of-graph
     * nodes, e.g. `INSTRUMENT` nodes.
     */
    traceGraph(time: number, nodes: AbstractVestigeNode[], edges: flow.Edge[]) {
       this.traceValues(time, nodes, edges);
       this.traceNotes(time, nodes, edges);
    }

    /** Forwards outputs from `VALUE` nodes to their final destinations. */
    private traceValues(time: number, nodes: AbstractVestigeNode[], edges: flow.Edge[]) {
        // Maps node IDs of `VALUE` generators to the number of inputs they have
        // received so far. A VALUE generator that has `valueNodeConnCount[keyof awaitingNodes]`
        // inputs is considered fulfilled.
        const awaitingNodes = new Map<string, number>();
        
        // This map holds the number of incoming connections that each VALUE node has.
        const valueNodeConnCount = nodes
            .filter(x => x.data.nodeType == "VALUE")
            .map(vnode => ({
                vnode,
                count: edges
                    .filter(edge => edge.target == vnode.id)
                    .length
            }))
            .reduce((map, entry) => {
                map.set(entry.vnode.id, entry.count);
                return map;
            }, new Map<string, number>());

        const traceOne = (node: AbstractVestigeNode, value: number) => {
            for (const { subNode, subEdge } of getConnected(node.id, nodes, edges)) {
                if (subNode.data.nodeType == "VALUE") {
                    // If this is another VALUE node, the flow continues.
                    const reqConnections = valueNodeConnCount.get(subNode.id) ?? 0;
                    const currConnections = awaitingNodes.get(subNode.id) ?? 0;

                    assert(reqConnections < currConnections, "number of required connection is lower than the number of current connections");

                    if (reqConnections == currConnections + 1) {
                        // If, with the input we will be giving the node, we satisfy
                        // the number of required connections, we can safely continue
                        // traversal.
                        traceOne(subNode, subNode.data.generator.generate(time));
                    } else {
                        // ...otherwise, we simply increment the amount of inputs
                        // this node has received so far.
                        awaitingNodes.set(subNode.id, currConnections + 1);
                    }
                } else {
                    // This is not a VALUE node, and thus, the value we currently
                    // hold flows to the parameter represented by the target handle.
                    if (subNode.data.nodeType != "EFFECT" && subNode.data.nodeType != "INSTRUMENT") {
                        console.error("Unexpected connection!", node, subNode, subEdge);
                        throw new Error("Invalid value node to non-value node connection");
                    }

                    assert(subEdge.targetHandle != null, "subEdge.targetHandle is null");
                    assert(subEdge.targetHandle in subNode.data.parameters, "no parameter found");

                    subNode.data.parameters[subEdge.targetHandle].change(value);
                }
            }
        }

        // For value nodes, all nodes have either pre-determined values (constants)
        // or get their values from other value nodes. Because of this, value nodes
        // don't really have a determined "required connection count", as all the minimum
        // number of connections for a value node is always 0.

        // We begin from value nodes that have no incoming connections.
        for (const node of getRootNodes(nodes, edges, "VALUE")) {
            traceOne(node, node.data.generator.generate(time));
        }
    }

    /** Forwards outputs from `NOTES` nodes to their final destinations. */
    private traceNotes(time: number, nodes: AbstractVestigeNode[], edges: flow.Edge[]) {
        // Maps node IDs of `NOTES` generators to the inputs they received so far. 
        const awaitingNodes = new Map<string, Map<string, number[]>>();
            
        const traceOne = (node: AbstractVestigeNode, notes: number[]) => {
            for (const { subNode, subEdge } of getConnected(node.id, nodes, edges)) {
                if (subNode.data.nodeType == "INSTRUMENT") {
                    // This is the last node in the chain! Just supply the
                    // note events to the Tone.js object.

                    const key = `${node.id}-${subNode.id}`;
                    let prevNotes = this.prevNoteMap.get(key);
                    if (prevNotes === undefined) {
                        prevNotes = [];
                    }

                    // Compute the difference between our current (`notes`) and the previous
                    // (`prevNotes`) active notes.
                    const events: NoteEvent[] = [];
                    for (const prevNote of prevNotes) {
                        if (notes.includes(prevNote))
                            continue;

                        // This note previously held, but now it isn't.
                        events.push({ pitch: prevNote, type: "NOTE_OFF" }); 
                    }

                    for (const note of notes) {
                        if (prevNotes.includes(note))
                            continue;

                        // This note wasn't previously held down.
                        events.push({ pitch: note, type: "NOTE_ON" });
                    }

                    if (events.length != 0) {
                        console.debug("🎹", events.map(x => `${x.type}: ${midiToName(x.pitch)} (${x.pitch})`));
                        subNode.data.generator.accept(events);
                    }

                    this.prevNoteMap.set(key, notes);
                } else if (subNode.data.nodeType == "NOTES") {
                    if (subNode.data.generator.inputs == 1) {
                        // If there's only one input, simply transform our current
                        // `notes` array, and continue traversal.
                        traceOne(subNode, subNode.data.generator.generate(
                            time,
                            mapFromSingle(subEdge.targetHandle!, notes)
                        ));
                    } else {
                        const existingInputs = awaitingNodes.get(subNode.id);
                        if (!existingInputs || existingInputs.size != subNode.data.generator.inputs - 1) {
                            // We still need more inputs for this node.
                            if (existingInputs) {
                                awaitingNodes.set(subNode.id, new Map([
                                    ...existingInputs.entries(),
                                    [subEdge.targetHandle!, notes]
                                ]));
                            } else {
                                awaitingNodes.set(subNode.id, mapFromSingle(subEdge.targetHandle!, notes));
                            }
                        } else {
                            // We have enough inputs for this note if we provide the notes
                            // we already have!
                            if (subNode.data.generator.inputs == 0) {
                                traceOne(subNode, subNode.data.generator.generate(time));
                            } else {
                                traceOne(
                                    subNode,
                                    subNode.data.generator.generate(time, new Map([
                                        ...existingInputs.entries(),
                                        [subEdge.targetHandle!, notes]
                                    ]))
                                );
                            }
                        }
                    }
                } else {
                    console.warn("Unexpected node - skipping!", node);
                }
            }
        }

        for (const node of getRootNodes(nodes, edges, "NOTES")) {
            if (node.data.generator.inputs != 0)
                continue;

            traceOne(node, node.data.generator.generate(time));
        }
    }
}
