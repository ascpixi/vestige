/**
 * An **automatable** is a normalized numeric parameter in the range of 0.0 to 1.0,
 * which can be automated via *value nodes*, such as the `LfoNode`.
 */
export class Automatable {
    /**
     * Changes the value of the automatable to the given number.
     */
    change: (x: number) => void;

    /**
     * The ID of the node that the automatable parameter is controlled by.
     * If the parameter is not controlled by any node (i.e. it's constant),
     * this member is `undefined`.
     */
    controlledBy?: string;

    /**
     * Returns `true` if the parameter is currently controlled by another node;
     * otherwise, `false`.
     */
    isAutomated() {
        return this.controlledBy != undefined;
    }

    constructor(change: (x: number) => void) {
        this.change = change;
    }
}

