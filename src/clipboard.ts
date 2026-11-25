import * as flow from "@xyflow/react";

import { AbstractVestigeNode, ParametricNodeData } from "./graph";
import { VESTIGE_NODE_SERIALIZERS, VestigeNode } from "./nodes";
import { deserializeNode, SerializedEdge, SerializedNode, serializeNode } from "./serializer";
import { Point, uniqueId } from "./util";

/** Represents a set of nodes (and the connections between them) that can be re-created later. */
export interface NodeSnapshot {
    nodes: SerializedNode[];
    edges: SerializedEdge[];
}

/** The distance between copied nodes and their originals, in pixels. */
const COPY_OFFSET = 40;

let clipboard: NodeSnapshot | null = null;

/**
 * Creates a snapshot of the given nodes, alongside all connections between them. The
 * final (output) node is never included.
 */
export function snapshotNodes(nodes: AbstractVestigeNode[], edges: flow.Edge[]): NodeSnapshot {
    nodes = nodes.filter(x => x.type != "final");
    const ids = new Set(nodes.map(x => x.id));

    return {
        nodes: nodes.map(x => serializeNode(x, VESTIGE_NODE_SERIALIZERS)),
        edges: edges
            .filter(x => ids.has(x.source) && ids.has(x.target))
            .map(x => ({ s: x.source, sh: x.sourceHandle, t: x.target, th: x.targetHandle }))
    };
}

/**
 * Re-creates the nodes of a snapshot with new IDs. If `position` is specified, the nodes
 * are placed so that their top-left corner is at that point - otherwise, they are offset
 * from their original positions. All created nodes are selected.
 */
export async function instantiateSnapshot(snapshot: NodeSnapshot, position: Point | null) {
    const minX = Math.min(...snapshot.nodes.map(x => x.x));
    const minY = Math.min(...snapshot.nodes.map(x => x.y));
    const ids = new Map<string, string>();

    const nodes: VestigeNode[] = await Promise.all(snapshot.nodes.map(async original => {
        const id = uniqueId();
        ids.set(original.i, id);

        const node = await deserializeNode({
            ...original,
            i: id,
            x: position ? position.x + (original.x - minX) : original.x + COPY_OFFSET,
            y: position ? position.y + (original.y - minY) : original.y + COPY_OFFSET
        }, VESTIGE_NODE_SERIALIZERS);

        // The copied edges will re-connect the automated parameters. If the node that drives
        // a parameter wasn't copied, the parameter has to become constant again.
        const { parameters } = node.data as ParametricNodeData;
        for (const param of Object.values(parameters ?? {})) {
            param.controlledBy = undefined;
        }

        return { ...node, selected: true } as VestigeNode;
    }));

    const edges: flow.Edge[] = snapshot.edges.map(x => ({
        id: uniqueId(),
        source: ids.get(x.s)!,
        sourceHandle: x.sh,
        target: ids.get(x.t)!,
        targetHandle: x.th,
        type: "vestige"
    }));

    return { nodes, edges };
}

/** Copies the given nodes (and the connections between them) to the clipboard. */
export function copyNodes(nodes: AbstractVestigeNode[], edges: flow.Edge[]) {
    const snapshot = snapshotNodes(nodes, edges);
    if (snapshot.nodes.length != 0) {
        clipboard = snapshot;
    }
}

/** Gets the contents of the clipboard, if any nodes were copied. */
export function getClipboard() {
    return clipboard;
}
