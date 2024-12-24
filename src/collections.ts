export function toAugmented<T>(array: T[]): ArrayProcessor<T> {
    return new ArrayProcessor(array);
}

/**
 * Allows for extended functionality when modifying arrays.
 */
export class ArrayProcessor<T> {
    constructor (
        private array: T[]
    ) {}

    collect() { return this.array; }

    map<TResult>(fn: (x: T) => TResult) {
        return toAugmented(this.array.map(fn));
    }

    /**
     * Repeats the elements in the processed array `n` times, optionally
     * invoking `fn` to map each element that will be present in the resulting
     * array. The `fn` function is provided both `idx` and `chunk`, where `idx`
     * is the index in the chunk, and `chunk` is the index of the chunk. All
     * indices are zero-based.
     */
    repeat(n: number, fn: (x: T, idx: number, chunk: number) => T) {
        if (n == 0)
            return toAugmented([]);

        const result: T[] = [];

        for (let i = 0; i < n; i++) {
            result.push(...this.array.map((x, idx) => fn(x, idx, i)));
        }

        return toAugmented(result);
    }

    /**
     * Returns the array with only the first `len` items.
     */
    take(len: number) {
        return toAugmented(this.array.slice(0, len));
    }
}