import { useState } from "react";

/**
 * Returns a stateful value, with a value to change it, bound to a
 * property `key` of the given `parent` object.
 */
export function useBoundState<TParent, K extends keyof TParent>(
    parent: TParent,
    key: K
): [TParent[K], (x: TParent[K]) => void] {
    const [getState, setState] = useState<TParent[K]>(parent[key]);

    return [
        getState,
        (x: TParent[K]) => {
            setState(x);
            parent[key] = x;
        }
    ];
}