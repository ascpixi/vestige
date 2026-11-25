import { describe, expect, it } from "vitest";
import * as tone from "tone";

import { VintageReverb } from "../nodes/effect/VintageReverb";
import { ReverbNodeData, ReverbNodeSerializer } from "../nodes/effect/ReverbNode";

const SAMPLE_RATE = 48000;

describe("vintage reverb", () => {
    it("decays at the requested rate", async () => {
        const buffer = await tone.Offline(async ctx => {
            const reverb = new VintageReverb();
            reverb.color = "NOW";
            reverb.decay = 1;
            reverb.mix = 1;
            reverb.output.toDestination();

            const impulse = ctx.createBuffer(1, 1, ctx.sampleRate);
            impulse.getChannelData(0)[0] = 1;

            const source = ctx.createBufferSource();
            source.buffer = impulse;
            tone.connect(source, reverb.input);
            source.start(0);
        }, 1.5, 1, SAMPLE_RATE);

        const data = buffer.getChannelData(0);
        function level(from: number, to: number) {
            let sum = 0;
            for (let i = from * SAMPLE_RATE; i < to * SAMPLE_RATE; i++) {
                sum += data[i] * data[i];
            }

            return 10 * Math.log10(sum / ((to - from) * SAMPLE_RATE));
        }

        expect(data.every(x => Number.isFinite(x))).toBe(true);

        // A T60 of 1 s means a drop of 60 dB per second, or 42 dB over 0.7 s.
        const drop = level(0.3, 0.4) - level(1.0, 1.1);
        expect(drop).toBeGreaterThan(30);
        expect(drop).toBeLessThan(55);
    });

    it("is the default algorithm, while older projects keep using Tone.js", async () => {
        const serializer = new ReverbNodeSerializer();
        const data = new ReverbNodeData();

        expect(data.effect.algorithm).toBe("VINTAGE");
        expect(data.effect.color).toBe("1970S");
        expect(data.effect.decay).toBe(4.5);
        expect(data.effect.wet).toBe(0.45);

        const legacy = serializer.serialize(data) as any;
        for (const key of ["g", "vc", "vz", "vd"]) {
            delete legacy[key];
        }

        const migrated = await serializer.deserialize(legacy);
        expect(migrated.effect.algorithm).toBe("TONE");

        data.effect.dispose();
        migrated.effect.dispose();
    });
});
