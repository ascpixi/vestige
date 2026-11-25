import * as tone from "tone";
import { registerProcessor } from "tone/build/esm/core/worklet/WorkletGlobalScope";

import { clamp, match } from "../../util";
import { ParameterizedWorklet } from "./worklet";

/**
 * The era of digital reverb hardware that the vintage reverb emulates. Older colors
 * have a narrower bandwidth and more modulation.
 */
export type VintageColor = "1970S" | "1980S" | "NOW";

interface ColorSettings {
    /** The cutoff of the bandwidth filters on the input, in Hz. */
    bandwidth: number;

    /** The maximum cutoff of the damping filters inside of the tank, in Hz. */
    maxDamping: number;

    /**
     * The excursion of the modulated allpasses, in samples (at the sample rate of
     * Dattorro's paper).
     */
    modDepth: number;
}

const COLORS: Record<VintageColor, ColorSettings> = {
    "1970S": { bandwidth: 9500, maxDamping: 8000, modDepth: 16 },
    "1980S": { bandwidth: 14000, maxDamping: 12000, modDepth: 12 },
    "NOW": { bandwidth: 20000, maxDamping: 20000, modDepth: 8 }
};

/** The average length of a single half of the tank, in seconds, with a size of 1. */
const HALF_TANK_LENGTH = 0.3627;

/** The highest decay gain that the tank is stable with. */
const MAX_DECAY_GAIN = 0.99;

/** The Q factor of filters without any resonance, in dB. */
const FLAT_Q = -3.01;

const WORKLET_NAME = "vestige-vintage-reverb";

// We implement the tank of the reverb as an AudioWorklet, as native Web Audio nodes delay
// feedback cycles by an entire render quantum. This makes it impossible to build accurate
// allpass filters (and, by extension, a stable plate reverb) out of them.
//
// The algorithm follows Jon Dattorro, "Effect Design, Part 1: Reverberator and Other
// Filters" (1997). We specify all lengths in samples at 29761 Hz (just like the paper does),
// and scale them to the actual sample rate and the size of the reverb.
registerProcessor(WORKLET_NAME, /* javascript */ `
    class VintageReverbProcessor extends AudioWorkletProcessor {
        static get parameterDescriptors() {
            return [
                {
                    name: "decay",
                    defaultValue: 0.5,
                    minValue: 0,
                    maxValue: 0.99,
                    automationRate: "k-rate"
                },
                {
                    name: "size",
                    defaultValue: 1,
                    minValue: 0.5,
                    maxValue: 2,
                    automationRate: "k-rate"
                },
                {
                    name: "damping",
                    defaultValue: 6000,
                    minValue: 100,
                    maxValue: 22000,
                    automationRate: "k-rate"
                },
                {
                    name: "modDepth",
                    defaultValue: 8,
                    minValue: 0,
                    maxValue: 64,
                    automationRate: "k-rate"
                }
            ];
        }

        constructor() {
            super();

            this.alive = true;
            this.port.onmessage = ev => {
                if (ev.data == "dispose") {
                    this.alive = false;
                }
            };

            this.scale = sampleRate / 29761;

            this.diffusers = [142, 107, 379, 277].map(x => this.makeLine(x));
            this.leftModAllpass = this.makeLine(672);
            this.leftDelayA = this.makeLine(4453);
            this.leftAllpass = this.makeLine(1800);
            this.leftDelayB = this.makeLine(3720);
            this.rightModAllpass = this.makeLine(908);
            this.rightDelayA = this.makeLine(4217);
            this.rightAllpass = this.makeLine(2656);
            this.rightDelayB = this.makeLine(3163);

            this.leftDamp = 0;
            this.rightDamp = 0;
            this.leftEnd = 0;
            this.rightEnd = 0;
            this.phase = 0;
        }

        /** Creates a delay line with the given length, in samples at 29761 Hz. */
        makeLine(length) {
            // Each line has enough room for the largest size, and the modulation excursion.
            const size = Math.ceil(length * this.scale * 2) + 256;
            return { buffer: new Float32Array(size), position: 0 };
        }

        /** Reads the sample written "delay" samples ago, with linear interpolation. */
        read(line, delay) {
            const length = line.buffer.length;
            const position = line.position - delay;
            const idx = Math.floor(position);

            const current = line.buffer[((idx % length) + length) % length];
            const next = line.buffer[(((idx + 1) % length) + length) % length];
            return current + (next - current) * (position - idx);
        }

        /** Writes a single sample to the given delay line. */
        write(line, sample) {
            line.buffer[line.position] = sample;
            line.position = (line.position + 1) % line.buffer.length;
        }

        /** Processes a single sample through a Schroeder allpass with the given delay and gain. */
        allpass(line, delay, gain, sample) {
            const delayed = this.read(line, delay);
            const fed = sample + gain * delayed;
            this.write(line, fed);
            return delayed - gain * fed;
        }

        /** Processes a single sample through a plain delay line. */
        delay(line, delay, sample) {
            const delayed = this.read(line, delay);
            this.write(line, sample);
            return delayed;
        }

        process(inputs, outputs, parameters) {
            const input = inputs[0] && inputs[0][0];
            const outL = outputs[0][0];
            const outR = outputs[0][1] || outputs[0][0];

            const decay = parameters.decay[0];
            const scale = parameters.size[0] * this.scale;
            const dampCoefficient = Math.exp(-2 * Math.PI * parameters.damping[0] / sampleRate);
            const excursion = parameters.modDepth[0] * this.scale;
            const decayDiffusion = Math.min(0.5, Math.max(0.25, decay + 0.15));
            const phaseIncrement = 2 * Math.PI / sampleRate;

            for (let i = 0; i < outL.length; i++) {
                let x = input ? input[i] : 0;

                // Input diffusion
                x = this.allpass(this.diffusers[0], 142 * scale, 0.75, x);
                x = this.allpass(this.diffusers[1], 107 * scale, 0.75, x);
                x = this.allpass(this.diffusers[2], 379 * scale, 0.625, x);
                x = this.allpass(this.diffusers[3], 277 * scale, 0.625, x);

                this.phase += phaseIncrement;

                if (this.phase > 2 * Math.PI) {
                    this.phase -= 2 * Math.PI;
                }

                // Left half of the tank
                let left = x + decay * this.rightEnd;
                left = this.allpass(
                    this.leftModAllpass,
                    672 * scale + excursion * Math.sin(this.phase),
                    -0.7,
                    left
                );

                left = this.delay(this.leftDelayA, 4453 * scale, left);
                this.leftDamp = left * (1 - dampCoefficient) + this.leftDamp * dampCoefficient;
                left = this.allpass(
                    this.leftAllpass,
                    1800 * scale,
                    decayDiffusion,
                    this.leftDamp * decay
                );

                const leftEnd = this.delay(this.leftDelayB, 3720 * scale, left);

                // Right half of the tank
                let right = x + decay * this.leftEnd;
                right = this.allpass(
                    this.rightModAllpass,
                    908 * scale + excursion * Math.cos(this.phase * 1.13),
                    -0.7,
                    right
                );

                right = this.delay(this.rightDelayA, 4217 * scale, right);
                this.rightDamp = right * (1 - dampCoefficient) + this.rightDamp * dampCoefficient;
                right = this.allpass(
                    this.rightAllpass,
                    2656 * scale,
                    decayDiffusion,
                    this.rightDamp * decay
                );

                const rightEnd = this.delay(this.rightDelayB, 3163 * scale, right);

                this.leftEnd = leftEnd;
                this.rightEnd = rightEnd;

                // Output taps (table 2 of Dattorro's paper)
                outL[i] = 0.6 * (
                        this.read(this.rightDelayA, 266 * scale)
                    + this.read(this.rightDelayA, 2974 * scale)
                    - this.read(this.rightAllpass, 1913 * scale)
                    + this.read(this.rightDelayB, 1996 * scale)
                    - this.read(this.leftDelayA, 1990 * scale)
                    - this.read(this.leftAllpass, 187 * scale)
                    - this.read(this.leftDelayB, 1066 * scale)
                );

                outR[i] = 0.6 * (
                        this.read(this.leftDelayA, 353 * scale)
                    + this.read(this.leftDelayA, 3627 * scale)
                    - this.read(this.leftAllpass, 1228 * scale)
                    + this.read(this.leftDelayB, 2673 * scale)
                    - this.read(this.rightDelayA, 2111 * scale)
                    - this.read(this.rightAllpass, 335 * scale)
                    - this.read(this.rightDelayB, 121 * scale)
                );
            }

            return this.alive;
        }
    }
`);

class VintageTank extends ParameterizedWorklet {
    protected _audioWorkletName() {
        return WORKLET_NAME;
    }
}

/**
 * A plate reverb, modeled after the reverb topology described by Jon Dattorro in
 * "Effect Design, Part 1: Reverberator and Other Filters" (1997), which was in turn
 * modeled after vintage Lexicon hardware. The input is diffused by a series of
 * allpasses, and then fed into a figure-eight tank of two cross-coupled delay lines.
 */
export class VintageReverb {
    input = new tone.Gain();
    output = new tone.Gain();

    private dry = new tone.Gain(0.5);
    private wet = new tone.Gain(0.5);
    private preDelayNode = new tone.Delay({ maxDelay: 1, delayTime: 0.02 });
    private lowCut = new tone.BiquadFilter({ type: "highpass", frequency: 30, Q: FLAT_Q });
    private bandwidthA = new tone.BiquadFilter({ type: "lowpass", Q: FLAT_Q });
    private bandwidthB = new tone.BiquadFilter({ type: "lowpass", Q: FLAT_Q });
    private tank = new VintageTank();

    private _decay = 4;
    private _size = 1;
    private _damping = 6000;
    private _color: VintageColor = "1980S";

    constructor() {
        this.input.connect(this.dry);
        this.input.chain(
            this.preDelayNode,
            this.lowCut,
            this.bandwidthA,
            this.bandwidthB,
            this.tank
        );
        this.tank.connect(this.wet);

        this.wet.connect(this.output);
        this.dry.connect(this.output);

        this.applyAll();
    }

    private applyAll() {
        const color = COLORS[this._color];

        this.bandwidthA.frequency.value = color.bandwidth;
        this.bandwidthB.frequency.value = color.bandwidth;
        this.tank.setParameter("modDepth", color.modDepth);

        this.applyDamping();
        this.applyDecay();
    }

    private applyDamping() {
        this.tank.setParameter("damping", Math.min(this._damping, COLORS[this._color].maxDamping));
    }

    private applyDecay() {
        // Each half of the tank applies the decay gain twice.
        const halfTankLength = HALF_TANK_LENGTH * this._size;
        const decay = Math.pow(10, (-3 * halfTankLength) / (2 * this._decay));

        this.tank.setParameter("decay", Math.min(MAX_DECAY_GAIN, decay));
        this.tank.setParameter("size", this._size);
    }

    /** The time it takes for the reverb to decay by 60 dB, in seconds. */
    get decay() { return this._decay; }
    set decay(value: number) {
        this._decay = Math.max(0.1, value);
        this.applyDecay();
    }

    /** The size of the simulated plate, from 0.5 to 2. */
    get size() { return this._size; }
    set size(value: number) {
        this._size = clamp(value, 0.5, 2);
        this.applyDecay();
    }

    /** The cutoff of the damping filters inside of the tank, in Hz. */
    get damping() { return this._damping; }
    set damping(value: number) {
        this._damping = value;
        this.applyDamping();
    }

    get color() { return this._color; }
    set color(value: VintageColor) {
        this._color = value;
        this.applyAll();
    }

    get preDelay() { return tone.Time(this.preDelayNode.delayTime.value).toSeconds(); }
    set preDelay(value: number) {
        this.preDelayNode.delayTime.value = value;
    }

    get mix() { return this.wet.gain.value; }
    set mix(value: number) {
        value = clamp(value);
        this.wet.gain.value = value;
        this.dry.gain.value = 1 - value;
    }

    dispose() {
        this.input.dispose();
        this.output.dispose();
        this.dry.dispose();
        this.wet.dispose();
        this.preDelayNode.dispose();
        this.lowCut.dispose();
        this.bandwidthA.dispose();
        this.bandwidthB.dispose();
        this.tank.dispose();
    }
}

/** Gets a user-friendly name of the given color. */
export function vintageColorName(color: VintageColor) {
    return match(color, {
        "1970S": "1970s",
        "1980S": "1980s",
        "NOW": "now"
    });
}
