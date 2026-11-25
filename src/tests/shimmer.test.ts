import { describe, expect, it } from "vitest";
import * as tone from "tone";

import { ShimmerNodeData } from "../nodes/effect/ShimmerNode";

const SAMPLE_RATE = 48000;

/** Gets the level (in dB) of `data` around the given frequency, between `from` and `to` seconds. */
function bandLevel(data: Float32Array, hz: number, from: number, to: number) {
    // We use a narrow band-pass filter from the Audio EQ Cookbook by Robert Bristow-Johnson.
    // https://www.w3.org/TR/audio-eq-cookbook/
    const q = 8;
    const omega = 2 * Math.PI * hz / SAMPLE_RATE;
    const alpha = Math.sin(omega) / (2 * q);
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(omega);
    const a2 = 1 - alpha;

    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    let sum = 0;

    for (let i = 0; i < to * SAMPLE_RATE; i++) {
        const y = (alpha * data[i] - alpha * x2 - a1 * y1 - a2 * y2) / a0;
        [x2, x1, y2, y1] = [x1, data[i], y1, y];

        if (i >= from * SAMPLE_RATE) {
            sum += y * y;
        }
    }

    return 10 * Math.log10(sum / ((to - from) * SAMPLE_RATE));
}

describe("shimmer", () => {
    it("adds an octave above the input, and stays stable", async () => {
        const buffer = await tone.Offline(() => {
            const data = new ShimmerNodeData();
            data.effect.wet = 1;
            data.effect.intensity = 0.6;
            data.effect.decay = 3;
            data.effect.output.toDestination();

            const oscillator = new tone.Oscillator(440, "sine").connect(data.effect.input);
            oscillator.volume.value = -12;
            oscillator.start(0).stop(1);
        }, 4, 1, SAMPLE_RATE);

        const data = buffer.getChannelData(0);
        expect(data.every(x => Number.isFinite(x) && Math.abs(x) < 1)).toBe(true);

        // Just like with a classic shimmer, the octave above blooms in the tail...
        const fundamental = bandLevel(data, 440, 1.5, 2);
        const octave = bandLevel(data, 880, 1.5, 2);
        expect(octave).toBeGreaterThan(fundamental - 12);

        // ...which then fades out. If the upper layers took over the tail, it'd sound metallic.
        expect(bandLevel(data, 880, 3.5, 4)).toBeLessThan(octave - 6);
        expect(bandLevel(data, 880, 3, 3.5)).toBeLessThan(bandLevel(data, 440, 3, 3.5) + 3);
    });
});
