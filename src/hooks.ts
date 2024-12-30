import { useEffect, useState } from "react";
import { allEqualUnordered } from "./util";

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