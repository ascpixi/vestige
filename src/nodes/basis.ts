import * as flow from "@xyflow/react";

import { VestigeNode } from ".";
import { uniqueId } from "../util";

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
): flow.Node<TData, TNodeType> {
    return {
        id: uniqueId(),
        position: { x, y },
        ...additional,

        type: type,
        data: data
    };
}
