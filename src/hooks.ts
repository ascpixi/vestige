import { useEffect, useState } from "react";
import { useEdges, useReactFlow } from "@xyflow/react";

import { allEqualUnordered } from "./util";
import { ParameterUnit, ParametricNodeData, VALUE_OUTPUT_HID } from "./graph";

/**
 * Returns a stateful value, with a value to change it, bound to a
 * property `key` of the given `parent` object.
 */
export function useBoundState<TParent, K extends keyof TParent>(
    parent: TParent,
    key: K
) {
    const [getState, setState] = useState<TParent[K]>(parent[key]);

    return [
        getState,
        (x: TParent[K]) => {
            setState(x);
            parent[key] = x;
        }
    ] as const;
}

/**
 * Synchronizes the last generated notes of a note generator, returning an up-to-date
 * state retrieved via the `getter`. This function only causes re-renders when the
 * active notes undergo an observable change (e.g. a shuffle isn't considered such a change).
 */
export function useNoteGeneratorSync(getter: () => number[]) {
    const [notes, setNotes] = useState<number[]>([]);

    useEffect(() => {
        const id = setInterval(() => {
            const lastNotes = getter();

            if (!allEqualUnordered(notes, lastNotes)) {
                setNotes(lastNotes);
            }
        }, 100);

        return () => clearInterval(id);
    }, [getter, notes]);

    return notes;
}

/**
 * Forces a re-render of the component when `shouldUpdate` returns `true` every
 * `rate` milliseconds.
 */
export function useUpdater(
    shouldUpdate: () => boolean,
    rate = (1 / 30) * 1000
) {
    const [, setTimestamp] = useState(Date.now());

    useEffect(() => {
        let updateLatch = false;

        const id = setInterval(() => {
            if (shouldUpdate()) {
                setTimestamp(Date.now());
                updateLatch = true;
            } else if (updateLatch) {
                setTimestamp(Date.now());
                updateLatch = false;
            }
        }, rate);

        return () => clearInterval(id);
    }, [shouldUpdate]);
}

/**
 * Gets the unit of the parameters that the value output of the given node is connected to.
 * If the node is connected to multiple parameters with different units (or to parameters
 * without a known unit), returns `null`.
 */
export function useTargetUnit(nodeId: string): ParameterUnit | null {
    const edges = useEdges();
    const { getNode } = useReactFlow();

    const units = edges
        .filter(x => x.source == nodeId && x.sourceHandle == VALUE_OUTPUT_HID)
        .map(x => {
            const data = getNode(x.target)?.data as ParametricNodeData | undefined;
            return data?.parameters?.[x.targetHandle ?? ""]?.unit;
        });

    if (units.length == 0 || units.some(x => !x || x !== units[0]))
        return null;

    return units[0]!;
}
