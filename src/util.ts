export function changeOne<T>(arr: T[], idx: number, newValue: T): T[] {
    arr[idx] = newValue;
    return [...arr];
}

export function removeOne<T>(arr: T[], idx: number) {
    const value = [...arr];
    value.splice(idx, 1);
    return value;
}

/**
 * Returns a random and unique value, in the form of a stringified base-36
 * number, e.g. `bn94abnte0k`.
 */
export function uniqueId() {
    return Math.random().toString(36).slice(2);
}

/**
 * Creates a map from a single key-value pair.
 */
export function mapFromSingle<TKey, TValue>(key: TKey, value: TValue) {
    return new Map<TKey, TValue>([[key, value]]);
}

export function assert(condition: any, msg?: string): asserts condition {
    if (!condition) {
        if (msg) {
            throw new Error(`Assertion failed: ${msg}`);
        } else {
            throw new Error("Assertion failed.");
        }
    }
}

/**
 * Logarithmically interpolates between `log10(min)` and `log10(max)`, where `x` is a value
 * between 0.0 and 1.0. 
 */
export function logLerp(x: number, minLog10: number, maxLog10: number) {
    x = Math.max(0, Math.min(x, 1));
    return Math.pow(10, minLog10 + x * (maxLog10 - minLog10));
}

/**
 * Inverse of `logLerp`. Converts a value in the range [10^minLog10, 10^maxLog10]
 * back to a normalized value in the range [0.0, 1.0].
 */
export function invLogLerp(x: number, minLog10: number, maxLog10: number) {
    const logFreq = Math.log10(x);
    return (logFreq - minLog10) / (maxLog10 - minLog10);
}

// Adapted from Bob Jenkins' One-At-A-Time hashing algorithm
export function hashify(x: number) {
    x += (x << 10);
    x ^= (x >>  6);
    x += (x <<  3);
    x ^= (x >> 11);
    x += (x << 15);
    return x;
}

/**
 * Linearly interpolates between `a` and `b` by `t`.
 */
export function lerp(a: number, b: number, t: number) {
    return a * (1 - t) + b * t;
}

/**
 * Clamps `x`, so that it is always in range of `min` and `max`. If the
 * bound is not specified, the number is clamped to a range of [0.0; 1.0].
 */
export function clamp(x: number, min = 0, max = 1) {
    return Math.min(max, Math.max(min, x));
}

/**
 * An inverse of `lerp` - given an arbitrary value `t` in the range of [`a`, `b`],
 * returns the value of `t = lerp(a, b, x)`, where `x` is the desired value. 
 */
export function invLerp(a: number, b: number, t: number) {
    return clamp((t - a) / (b - a));
}

/** Returns a random integer between `min` (inclusive) and `max` (inclusive). */
// Attribution: https://stackoverflow.com/a/1527820/13153269
export function randInt(min: number, max: number, rng: () => number = () => Math.random()) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Returns a seeded pseudo-random number generator, based on the SplitMix32
 * algorithm.
 */
// Attribution: https://stackoverflow.com/a/47593316/13153269
export function seedRng(seed: number) {
    let a = seed;

    return () => {
        a |= 0;
        a = a + 0x9e3779b9 | 0;
        let t = a ^ a >>> 16;
        t = Math.imul(t, 0x21f0aaad);
        t = t ^ t >>> 15;
        t = Math.imul(t, 0x735a2d97);
        return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
    };
}

/**
 * Picks N random elements from an array using the provided random number generator.
 */
export function pickRandom<T>(
    array: T[],
    n: number,
    rng: () => number = () => Math.random()
): T[] {
    if (n < 0 || n > array.length)
        throw new Error(`Cannot pick ${n} elements from array of length ${array.length}`);

    const result = [...array];
    
    for (let i = 0; i < n; i++) {
        const remainingLength = array.length - i;
        const j = i + Math.floor(rng() * remainingLength);
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result.slice(0, n);
}

/**
 * Represents a two-dimensional vector.
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Gets the squared distance between two points. This is a faster operation
 * than `distance`, and should be preferred when comparing distances.
 */
export function distanceSqr(a: Point, b: Point) {
    const d1 = b.x - a.x;
    const d2 = b.y - a.y;
    return (d1 * d1) + (d2 * d2);
}

/**
 * Similar to a "switch expression" in languages like C#.
 * 
 *     const myValue = match(someValue, {
 *       "ONE": 1,
 *       "TWO": 2,
 *       "THREE": 3
 *     });
 * 
 */
export function match<TTarget extends string | number | symbol, TOutput>(
    against: TTarget,
    cases: Partial<{ [matchCase in TTarget]: TOutput }>
) {
    if (!(against in cases)) {
        console.error("match(...) did not account for case", against, ". Cases:", cases);
        throw new Error(`Unhandled "${String(against)}" value in "match" block.`)
    }

    return cases[against]!;
}

/**
 * Allows to use the `in` operator to check if an array includes an element -
 * for example, `"example" in anyOf("one", "two")`.
 */
export function anyOf<T extends string | number>(...elements: T[]): { [k in typeof elements[number]]: never } {
    const o: any = {};
    for (const element of elements) {
        o[element] = null;
    }

    return o;
} 
/**
 * Returns x², or `x * x`.
 */
export function sqr(x: number) {
    return x * x;
}

/**
 * Returns an array with all integers in the range of `[min, max]`, inclusive.
 * For example, for `range(0, 4)`, this function returns `[0, 1, 2, 3, 4]`.
 */
export function range(min: number, max: number): number[];

/**
 * Returns an array with all integers in the range of `[min, max]`, incrementing
 * by `step`. For example, for `range(0, 8, 2)`, this function returns
 * `[0, 2, 4, 6, 8]`.
 */
export function range(min: number, max: number, step: number): number[];

/**
 * Returns an array, starting from 0, with the given amount of elements.
 * For example, for `range(4)`, this function returns `[0, 1, 2, 3]`.
 */
export function range(length: number): number[];

export function range(min: number, max?: number, step?: number): number[] {
    if (max === undefined) {
        max = min - 1;
        min = 0;
    }

    step ??= 1;

    const seq = [];
    for (let i = min; i < max + 1; i += step) {
        seq.push(i);
    }

    return seq;
}

/**
 * Checks if all numbers from array `a` are equal to the numbers in array `b`,
 * regardless of order.
 */
export function allEqualUnordered(a: number[], b: number[]) {
    if (a.length !== b.length)
        return false;

    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);

    for (let i = 0; i < sortedA.length; i++) {
        if (sortedA[i] !== sortedB[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Creates a copy of the target array, and if it does not contain `item`,
 * adds it to the copy. If `item` already was included in the array, it is only copied.
 */
export function includeUnique<T>(arr: T[], item: T) {
    return arr.includes(item) ? [...arr] : [...arr, item];
}

/**
 * Equivalent to `arr[arr.length - 1]`.
 */
export function last<T>(arr: T[]) {
    return arr[arr.length - 1];
}