import { describe, expect, it } from "vitest";

import { StepSeqAudioGenerator } from "../nodes/instrument/StepSeqNode";
import { range } from "../util";

/**
 * Creates a step sequencer generator with a fake set of players, which records the
 * (song) times at which samples were triggered instead of playing them.
 */
function makeSequencer() {
    const gen = new StepSeqAudioGenerator();
    const hits: number[] = [];
    let songTime = 0;

    // The context time is offset from the song time, just like in the real application.
    const contextOffset = 12.345;

    (gen as unknown as { players: unknown }).players = {
        loaded: true,
        context: { now: () => songTime + contextOffset },
        player: () => ({ start: (when: number) => hits.push(when - contextOffset) })
    };

    gen.tracks.push({
        sample: "707bd" as never,
        steps: range(16).map(x => x % 4 == 0)
    });

    return {
        gen,
        hits,
        tick(time: number) {
            songTime = time;
            gen.onTick(time);
        }
    };
}

describe("step sequencer", () => {
    it("schedules steps on the tempo grid, regardless of tick jitter", () => {
        const { gen, hits, tick } = makeSequencer();
        gen.bpm = 120;

        // Irregular ticks, simulating timer jitter.
        let time = 0;
        while (time < 4) {
            tick(time);
            time += 0.005 + ((time * 7919) % 0.02);
        }

        // At 120 BPM, a 16th note lasts 125 ms, so a kick on every 4th step is every 500 ms.
        // Steps within the lookahead window past the last tick are scheduled as well.
        expect(hits.length).toBeGreaterThanOrEqual(8);
        hits.forEach((x, i) => expect(x).toBeCloseTo(i * 0.5, 6));
    });

    it("follows changes of its tempo", () => {
        const { gen, hits, tick } = makeSequencer();
        gen.bpm = 120;

        for (let time = 0; time < 1; time += 0.01) {
            tick(time);
        }

        gen.bpm = 60;

        for (let time = 1; time < 3; time += 0.01) {
            tick(time);
        }

        // Hits after the tempo change are on the 60 BPM grid (one every second).
        const after = hits.filter(x => x > 1.01);
        after.forEach(x => expect(x % 1).toBeCloseTo(0, 6));
        expect(after.length).toBeGreaterThan(0);
    });

    it("stays in phase with sequencers at other tempos", () => {
        const a = makeSequencer();
        const b = makeSequencer();
        a.gen.bpm = 120;
        b.gen.bpm = 90;

        for (let time = 0; time < 4; time += 0.0137) {
            a.tick(time);
            b.tick(time);
        }

        // 120 against 90 BPM is a 4:3 polyrhythm, with both downbeats meeting every 2 seconds.
        const shared = a.hits.filter(x => b.hits.some(y => Math.abs(x - y) < 1e-9));
        expect(shared.map(x => Math.round(x * 1000) / 1000)).toEqual([0, 2, 4]);
    });
});
