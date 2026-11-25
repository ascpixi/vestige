import * as flow from "@xyflow/react";
import * as tone from "tone";
import { registerProcessor } from "tone/build/esm/core/worklet/WorkletGlobalScope";
import { memo, useEffect, useState } from "react";
import { RiSparklingFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { Automatable, linearUnit, AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { assert, clamp, invLogLerp, lerp, logLerp } from "../../util";
import { formatFrequency, parseFrequency } from "../../audioUtil";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState } from "../../hooks";
import { ParameterizedWorklet } from "./worklet";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";

const MIN_DECAY = 0.5;
const MAX_DECAY = 20;

const MIN_PREDELAY = 0;
const MAX_PREDELAY = 0.5;

/** Frequencies typed in by the user that are lower than this are in kHz, not Hz. */
const MIN_FREQUENCY_INPUT = 20;

const LOG_MIN_HIGH_CUT = Math.log10(1000);
const LOG_MAX_HIGH_CUT = Math.log10(18_000);

const LOG_MIN_LOW_CUT = Math.log10(20);
const LOG_MAX_LOW_CUT = Math.log10(1000);

const scalarToDecay = (x: number) => lerp(MIN_DECAY, MAX_DECAY, x);
const decayToScalar = (x: number) => (x - MIN_DECAY) / (MAX_DECAY - MIN_DECAY);
const scalarToPreDelay = (x: number) => lerp(MIN_PREDELAY, MAX_PREDELAY, x);
const preDelayToScalar = (x: number) => (x - MIN_PREDELAY) / (MAX_PREDELAY - MIN_PREDELAY);

const DECAY_UNIT = linearUnit(MIN_DECAY, MAX_DECAY, x => `${x.toFixed(1)} s`);
const PREDELAY_UNIT = linearUnit(
  MIN_PREDELAY * 1000,
  MAX_PREDELAY * 1000,
  x => `${Math.round(x)} ms`
);

const WORKLET_NAME = "vestige-shimmer";

// We implement the shimmer as an AudioWorklet. Native Web Audio nodes delay feedback cycles
// by a render quantum, and the pitch shifter of Tone.js is a simple two-tap granular shifter,
// which sounds glitchy and discordant inside of a feedback loop.
//
// The design follows the classic Eno/Lanois shimmer: we have a regular reverb (input diffusers
// followed by an 8-line feedback delay network), with a pitch shifter in a feedback loop around
// its input. We delay, band-limit and pitch-shift the diffused input, and feed it back into the
// diffusers. Each pass adds a new, quieter layer above the last one, and the reverb then sustains
// all layers alike.
//
// The shifter is NOT fed by the (long) tail of the reverb. If it was, each layer would keep
// feeding the layer above it for as long as the reverb rings, and the upper layers would grow
// over time, until they'd dominate the tail with thin, metallic tones.
//
// Granular pitch shifters comb-filter and amplitude-modulate their input, which turns into
// a discordant mess when repeated in a loop. That's why we use a phase vocoder with identity
// phase locking (Laroche & Dolson, 1999), which moves each spectral peak, alongside its region
// of influence, to its new frequency. The phases of the bins around the peak stay relative to it.
//
// Tone.js expects a single expression that evaluates to the processor class, so we define
// the processor within a function.
registerProcessor(WORKLET_NAME, /* javascript */ `(() => {
  const LINE_LENGTHS_MS = [37.1, 41.3, 47.9, 53.3, 61.7, 67.9, 73.1, 83.9];
  const LINE_MOD_RATES = [0.11, 0.17, 0.23, 0.29, 0.31, 0.37, 0.41, 0.47];
  const LINE_COUNT = LINE_LENGTHS_MS.length;
  const OUT_SIGNS_L = [1, -1, 1, -1, 1, -1, 1, -1];
  const OUT_SIGNS_R = [1, 1, -1, -1, 1, 1, -1, -1];
  const LOOP_DELAY_MS = 120;

  /**
   * Mixes the given 8 values with an (orthonormal) Hadamard matrix, in place. Unlike a
   * Householder matrix, every line feeds every other line with equal energy, which results
   * in a much denser, smoother tail.
   */
  function hadamard8(values) {
    for (let len = 1; len < 8; len <<= 1) {
      for (let i = 0; i < 8; i += len << 1) {
        for (let j = i; j < i + len; j++) {
          const a = values[j];
          const b = values[j + len];
          values[j] = a + b;
          values[j + len] = a - b;
        }
      }
    }

    for (let i = 0; i < 8; i++) {
      values[i] *= Math.SQRT1_2 / 2; // 1 / sqrt(8)
    }
  }

  /** A delay line, backed by a circular buffer. */
  class DelayLine {
    constructor(length) {
      this.buffer = new Float32Array(length);
      this.position = 0;
    }

    /** Reads the sample written "delay" samples ago, with linear interpolation. */
    read(delay) {
      const length = this.buffer.length;
      const position = this.position - delay;
      const idx = Math.floor(position);

      const current = this.buffer[((idx % length) + length) % length];
      const next = this.buffer[(((idx + 1) % length) + length) % length];
      return current + (next - current) * (position - idx);
    }

    /** Writes a single sample to the delay line. */
    write(sample) {
      this.buffer[this.position] = sample;
      this.position = (this.position + 1) % this.buffer.length;
    }
  }

  /** A Schroeder allpass filter. */
  class Allpass {
    constructor(length, gain) {
      this.line = new DelayLine(length + 2);
      this.length = length;
      this.gain = gain;
    }

    process(sample) {
      const delayed = this.line.read(this.length);
      const fed = sample + this.gain * delayed;
      this.line.write(fed);
      return delayed - this.gain * fed;
    }
  }

  /** A one-pole filter, usable as either a low-pass or a high-pass one. */
  class OnePole {
    constructor() {
      this.state = 0;
      this.coefficient = 0;
    }

    /** Sets the cutoff frequency of the filter, in Hz. */
    setCutoff(hz) {
      this.coefficient = Math.exp(-2 * Math.PI * Math.min(hz, sampleRate * 0.45) / sampleRate);
    }

    lowpass(sample) {
      this.state = sample * (1 - this.coefficient) + this.state * this.coefficient;
      return this.state;
    }

    highpass(sample) {
      return sample - this.lowpass(sample);
    }
  }

  /** An in-place, radix-2 complex FFT. */
  class FFT {
    constructor(size) {
      this.size = size;
      this.cos = new Float64Array(size / 2);
      this.sin = new Float64Array(size / 2);
      for (let i = 0; i < size / 2; i++) {
        this.cos[i] = Math.cos(2 * Math.PI * i / size);
        this.sin[i] = Math.sin(2 * Math.PI * i / size);
      }

      // The order of the elements, with the bits of their indices reversed.
      const bits = Math.log2(size);
      this.reversed = new Uint32Array(size);

      for (let i = 0; i < size; i++) {
        for (let bit = 0; bit < bits; bit++) {
          this.reversed[i] |= ((i >> bit) & 1) << (bits - 1 - bit);
        }
      }
    }

    transform(re, im, inverse) {
      const n = this.size;
      for (let i = 0; i < n; i++) {
        const j = this.reversed[i];
        if (i < j) {
          [re[i], re[j]] = [re[j], re[i]];
          [im[i], im[j]] = [im[j], im[i]];
        }
      }

      const sign = inverse ? 1 : -1;
      for (let len = 2; len <= n; len <<= 1) {
        const step = n / len;
        for (let i = 0; i < n; i += len) {
          for (let k = 0; k < len / 2; k++) {
            const twiddleRe = this.cos[k * step];
            const twiddleIm = sign * this.sin[k * step];

            const a = i + k;
            const b = a + len / 2;
            const rotatedRe = re[b] * twiddleRe - im[b] * twiddleIm;
            const rotatedIm = re[b] * twiddleIm + im[b] * twiddleRe;

            re[b] = re[a] - rotatedRe;
            im[b] = im[a] - rotatedIm;
            re[a] += rotatedRe;
            im[a] += rotatedIm;
          }
        }
      }
    }
  }

  /** Wraps the given phase to the range of [-pi; pi]. */
  function wrapPhase(phase) {
    return phase - 2 * Math.PI * Math.round(phase / (2 * Math.PI));
  }

  /**
   * A phase vocoder pitch shifter with identity phase locking. Introduces a latency
   * equal to its frame size.
   */
  class PhaseVocoder {
    constructor(size, hop) {
      this.size = size;
      this.hop = hop;
      this.fft = new FFT(size);
      this.window = new Float64Array(size)
        .map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));

      // For Hann analysis and synthesis windows, overlapping frames sum to size / hop * 3/8.
      this.gain = 1 / (size / hop * 0.375);

      this.input = new Float64Array(size);
      this.inputPos = 0;
      this.counter = 0;

      this.acc = new Float64Array(size);
      this.ready = new Float64Array(hop);
      this.readyPos = 0;

      this.re = new Float64Array(size);
      this.im = new Float64Array(size);
      this.mag = new Float64Array(size / 2 + 1);
      this.phase = new Float64Array(size / 2 + 1);
      this.prevPhase = new Float64Array(size / 2 + 1);
      this.synthPhase = new Float64Array(size / 2 + 1);
      this.prevSynthPhase = new Float64Array(size / 2 + 1);
      this.ratio = 2;

      // The peaks of the previous frame - their bins, synthesized phases and frequencies.
      this.prevPeaks = [];
    }

    process(sample) {
      this.input[this.inputPos] = sample;
      this.inputPos = (this.inputPos + 1) % this.size;

      const out = this.ready[this.readyPos];
      this.readyPos++;
      this.counter++;

      if (this.counter == this.hop) {
        this.counter = 0;
        this.processFrame();
        this.readyPos = 0;
      }

      return out;
    }

    processFrame() {
      const { size, hop, re, im, mag, phase, window } = this;
      const half = size / 2;
      const ratio = this.ratio;

      // First, we analyze the frame. We rotate it by half of its size, so that the measured
      // phases correspond to the center of the frame ("zero-phase" windowing).
      for (let i = 0; i < size; i++) {
        const sample = this.input[(this.inputPos + i) % size] * window[i];
        re[(i + half) % size] = sample;
        im[(i + half) % size] = 0;
      }

      this.fft.transform(re, im, false);

      let maxMag = 0;
      for (let k = 0; k <= half; k++) {
        mag[k] = Math.hypot(re[k], im[k]);
        phase[k] = Math.atan2(im[k], re[k]);
        maxMag = Math.max(maxMag, mag[k]);
      }

      // Now we need to find the spectral peaks, which are louder than all bins around them.
      const peaks = [];
      for (let k = 2; k < half - 2; k++) {
        if (
          mag[k] > maxMag * 1e-4 &&
          mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] &&
          mag[k] > mag[k - 2] && mag[k] >= mag[k + 2]
        ) {
          peaks.push(k);
        }
      }

      re.fill(0);
      im.fill(0);

      // Bins which don't receive any energy keep their phase advancing at their own frequency.
      for (let k = 0; k <= half; k++) {
        this.synthPhase[k] = this.prevSynthPhase[k] + 2 * Math.PI * k * hop / size;
      }

      // We can take a shortcut when shifting by an exact octave. As the phases are measured at
      // the center of the frame, doubling them results in phases that are perfectly consistent
      // between frames, so we don't have to accumulate them over time.
      const isOctave = Math.abs(ratio - 2) < 1e-6;
      const currPeaks = [];
      let prevIdx = 0;

      for (let p = 0; p < peaks.length; p++) {
        const k = peaks[p];
        const firstBin = p == 0 ? 0 : Math.floor((peaks[p - 1] + k) / 2) + 1;
        const lastBin = p == peaks.length - 1 ? half : Math.floor((k + peaks[p + 1]) / 2);

        // The true frequency of the peak (in radians per sample), from its phase advance.
        const expected = 2 * Math.PI * k * hop / size;
        const omega = (expected + wrapPhase(phase[k] - this.prevPhase[k] - expected)) / hop;

        // A parabolic fit of the peak gives a more precise target bin.
        const curvature = mag[k - 1] - 2 * mag[k] + mag[k + 1];
        const offset = curvature == 0 ? 0 : 0.5 * (mag[k - 1] - mag[k + 1]) / curvature;
        const target = Math.round((k + offset) * ratio);
        const shift = target - k;

        if (target <= 0 || target >= half)
          continue;

        let peakPhase;
        if (isOctave) {
          peakPhase = 2 * phase[k];
        }
        else {
          // We continue the phase of the closest peak of the previous frame (peak tracking), so
          // that peaks drifting between bins don't cause phase discontinuities.
          const prev = this.prevPeaks;
          while (
            prevIdx + 1 < prev.length &&
            Math.abs(prev[prevIdx + 1].bin - k) <= Math.abs(prev[prevIdx].bin - k)
          ) {
            prevIdx++;
          }

          if (prev.length != 0 && Math.abs(prev[prevIdx].bin - k) <= 3) {
            peakPhase = prev[prevIdx].phase + ratio * (prev[prevIdx].omega + omega) / 2 * hop;
          }
          else {
            peakPhase = this.prevSynthPhase[target] + ratio * omega * hop;
          }
        }

        currPeaks.push({ bin: k, phase: peakPhase, omega });

        for (let j = firstBin; j <= lastBin; j++) {
          const dest = j + shift;
          if (dest <= 0 || dest >= half)
            continue;

          const destPhase = peakPhase + phase[j] - phase[k];
          re[dest] += mag[j] * Math.cos(destPhase);
          im[dest] += mag[j] * Math.sin(destPhase);
          this.synthPhase[dest] = destPhase;
        }
      }

      this.prevPeaks = currPeaks;

      [this.prevPhase, this.phase] = [this.phase, this.prevPhase];
      this.prevPhase.set(phase);
      [this.prevSynthPhase, this.synthPhase] = [this.synthPhase, this.prevSynthPhase];

      // Finally, we synthesize the shifted frame. We have to mirror the spectrum first, so that
      // the output is real.
      for (let k = 1; k < half; k++) {
        re[size - k] = re[k];
        im[size - k] = -im[k];
      }

      this.fft.transform(re, im, true);

      for (let i = 0; i < size; i++) {
        this.acc[i] += re[(i + half) % size] / size * window[i] * this.gain;
      }

      this.ready.set(this.acc.subarray(0, hop));
      this.acc.copyWithin(0, hop);
      this.acc.fill(0, size - hop);
    }
  }

  class ShimmerProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: "decay", defaultValue: 6, minValue: 0.1, maxValue: 60, automationRate: "k-rate" },
        { name: "size", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
        { name: "shimmer", defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: "k-rate" },
        { name: "shift", defaultValue: 12, minValue: -24, maxValue: 24, automationRate: "k-rate" },
        {
          name: "highCut",
          defaultValue: 8000,
          minValue: 500,
          maxValue: 20000,
          automationRate: "k-rate"
        },
        {
          name: "lowCut",
          defaultValue: 150,
          minValue: 10,
          maxValue: 2000,
          automationRate: "k-rate"
        },
        { name: "modDepth", defaultValue: 0.7, minValue: 0, maxValue: 3, automationRate: "k-rate" }
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

      const ms = x => Math.round(x / 1000 * sampleRate);

      this.diffusers = [
        new Allpass(ms(4.77), 0.75),
        new Allpass(ms(3.59), 0.75),
        new Allpass(ms(12.73), 0.625),
        new Allpass(ms(9.31), 0.625)
      ];

      // Lines have room for the largest size (1.5x), plus modulation.
      this.lines = LINE_LENGTHS_MS.map(x => new DelayLine(ms(x * 1.5) + ms(4)));
      this.lineOut = new Float32Array(LINE_COUNT);
      this.mix = new Float64Array(LINE_COUNT);
      this.damping = LINE_LENGTHS_MS.map(() => new OnePole());
      this.phases = LINE_LENGTHS_MS.map((_, i) => i / LINE_COUNT * 2 * Math.PI);

      // A frame of ~85 ms, with an overlap of 8, is the sweet spot for polyphonic material.
      const frame = sampleRate > 64000 ? 8192 : 4096;
      this.shifter = new PhaseVocoder(frame, frame / 8);

      this.inputDc = new OnePole();
      this.loopLowCutA = new OnePole();
      this.loopLowCutB = new OnePole();
      this.loopHighCutA = new OnePole();
      this.loopHighCutB = new OnePole();
      this.loopHighCutPost = new OnePole();
      this.feedback = 0;

      // The loop delay paces the bloom of each layer.
      this.loopDelayLength = ms(LOOP_DELAY_MS);
      this.loopDelay = new DelayLine(this.loopDelayLength + 2);

      // The state of the limiter of the shimmer loop.
      this.envelope = 0;
      this.limiterGain = 1;

      // We smooth these parameters in order to prevent zipper noise.
      this.size = 0.7;
      this.shimmer = 0;
      this.denormal = 1e-20;
    }

    process(inputs, outputs, parameters) {
      const input = inputs[0] && inputs[0][0];
      const outL = outputs[0][0];
      const outR = outputs[0][1] || outputs[0][0];

      const smooth = 0.1;
      this.size += (parameters.size[0] - this.size) * smooth;
      this.shimmer += (parameters.shimmer[0] - this.shimmer) * smooth;
      this.shifter.ratio = Math.pow(2, parameters.shift[0] / 12);

      const decay = parameters.decay[0];
      const highCut = parameters.highCut[0];
      const lowCut = parameters.lowCut[0];

      const scale = 0.5 + this.size;
      const lengths = LINE_LENGTHS_MS.map(x => x / 1000 * sampleRate * scale);
      const gains = lengths.map(x => Math.min(0.98, Math.pow(10, -3 * x / (decay * sampleRate))));
      const modDepth = parameters.modDepth[0] / 1000 * sampleRate * scale;

      const loopGain = 0.95 * Math.pow(this.shimmer, 0.4);

      // We keep the damping of the reverb itself well above the high cut of the shimmer loop.
      // This way, a dark loop warms up the shimmer without dulling the whole reverb.
      this.damping.forEach(x => x.setCutoff(Math.min(16000, Math.max(highCut * 2, 6000))));
      this.inputDc.setCutoff(20);
      this.loopLowCutA.setCutoff(lowCut);
      this.loopLowCutB.setCutoff(lowCut);
      this.loopHighCutA.setCutoff(highCut);
      this.loopHighCutB.setCutoff(highCut);
      this.loopHighCutPost.setCutoff(highCut * 1.2);

      // Detector and gain smoothing coefficients of the limiter.
      const detector = Math.exp(-1 / (0.05 * sampleRate));
      const attack = Math.exp(-1 / (0.08 * sampleRate));
      const release = Math.exp(-1 / (1.5 * sampleRate));
      const threshold = 0.25;

      for (let s = 0; s < outL.length; s++) {
        this.denormal = -this.denormal;

        // The input of the reverb is the dry signal, and the pitch-shifted feedback.
        let x = this.inputDc.highpass((input ? input[s] : 0) + this.denormal) + this.feedback;
        for (const diffuser of this.diffusers) {
          x = diffuser.process(x);
        }

        const send = this.loopDelay.read(this.loopDelayLength);
        this.loopDelay.write(x);

        for (let i = 0; i < LINE_COUNT; i++) {
          this.phases[i] += 2 * Math.PI * LINE_MOD_RATES[i] / sampleRate;
          const out = this.lines[i].read(lengths[i] + modDepth * Math.sin(this.phases[i]));
          this.lineOut[i] = out;
        }

        // Each channel reads all lines, with signs taken from different rows of a Hadamard
        // matrix. This makes the two channels orthogonal, and thus decorrelated (wide).
        let left = 0;
        let right = 0;
        for (let i = 0; i < LINE_COUNT; i++) {
          left += this.lineOut[i] * OUT_SIGNS_L[i];
          right += this.lineOut[i] * OUT_SIGNS_R[i];
        }

        outL[s] = left * 0.35;
        outR[s] = right * 0.35;

        this.mix.set(this.lineOut);
        hadamard8(this.mix);

        for (let i = 0; i < LINE_COUNT; i++) {
          const damped = this.damping[i].lowpass(this.mix[i]);
          this.lines[i].write(gains[i] * damped + x * 0.35);
        }

        // This is the shimmer loop: we band-limit the delayed, diffused input, shift it, and
        // feed it back.
        let filtered = this.loopLowCutB.highpass(this.loopLowCutA.highpass(send));
        filtered = this.loopHighCutB.lowpass(this.loopHighCutA.lowpass(filtered));

        const shifted = this.shifter.process(filtered) * loopGain;

        // The loop has to be limited, or else it'd build up indefinitely. We only ever scale the
        // signal by a smoothly changing gain, as waveshaping introduces intermodulation distortion.
        this.envelope = this.envelope * detector + shifted * shifted * (1 - detector);
        const level = Math.sqrt(this.envelope);
        const target = level > threshold ? threshold / level : 1;
        const coeff = target < this.limiterGain ? attack : release;
        this.limiterGain = target + (this.limiterGain - target) * coeff;

        this.feedback = this.loopHighCutPost.lowpass(shifted * this.limiterGain);
      }

      return this.alive;
    }
  }

  return ShimmerProcessor;
})()`);

export class ShimmerNodeData extends EffectNodeData {
  effect: ShimmerAudioEffect;
  parameters: {
    "param-intensity": Automatable,
    "param-decay": Automatable,
    "param-predelay": Automatable,
    "param-wet": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new ShimmerAudioEffect();
    this.parameters = {
      "param-intensity": new Automatable(x => this.effect.intensity = x),
      "param-decay": new Automatable(x => this.effect.decay = scalarToDecay(x), DECAY_UNIT),
      "param-predelay": new Automatable(
        x => this.effect.preDelay = scalarToPreDelay(x),
        PREDELAY_UNIT
      ),
      "param-wet": new Automatable(x => this.effect.wet = x)
    };
  }
};

class ShimmerWorklet extends ParameterizedWorklet {
  protected _audioWorkletName() {
    return WORKLET_NAME;
  }
}

/**
 * A reverb with a pitch shifter inside of its feedback loop. Each pass through the loop
 * shifts the signal by `shift` semitones, creating a rising cascade of harmonics.
 */
export class ShimmerAudioEffect implements AudioEffect {
  input = new tone.Gain();
  output = new tone.Gain();

  private preDelayNode = new tone.Delay({ maxDelay: MAX_PREDELAY + 0.01, delayTime: 0.04 });
  private reverb = new ShimmerWorklet();
  private wetOut = new tone.Gain(0.35);
  private dryOut = new tone.Gain(1.0 - 0.35);

  private _shift = 12;
  private _intensity = 0.6;
  private _decay = 6;
  private _size = 0.7;
  private _highCut = 8000;
  private _lowCut = 150;

  constructor() {
    this.input.connect(this.dryOut);
    this.input.chain(this.preDelayNode, this.reverb, this.wetOut);

    this.wetOut.connect(this.output);
    this.dryOut.connect(this.output);

    this.reverb.setParameter("shift", this._shift);
    this.reverb.setParameter("shimmer", this._intensity);
    this.reverb.setParameter("decay", this._decay);
    this.reverb.setParameter("size", this._size);
    this.reverb.setParameter("highCut", this._highCut);
    this.reverb.setParameter("lowCut", this._lowCut);
  }

  /** The pitch shift applied in the feedback loop, in semitones. */
  get shift() { return this._shift; }
  set shift(value: number) {
    this._shift = value;
    this.reverb.setParameter("shift", value);
  }

  /** The amount of the signal that is fed back through the pitch shifter, from 0.0 to 1.0. */
  get intensity() { return this._intensity; }
  set intensity(value: number) {
    this._intensity = clamp(value);
    this.reverb.setParameter("shimmer", this._intensity);
  }

  /** The time it takes for the reverb tail to decay by 60 dB, in seconds. */
  get decay() { return this._decay; }
  set decay(value: number) {
    this._decay = Math.max(MIN_DECAY, value);
    this.reverb.setParameter("decay", this._decay);
  }

  /** The size of the simulated space, from 0.0 to 1.0. */
  get size() { return this._size; }
  set size(value: number) {
    this._size = clamp(value);
    this.reverb.setParameter("size", this._size);
  }

  get preDelay() { return tone.Time(this.preDelayNode.delayTime.value).toSeconds(); }
  set preDelay(value: number) {
    this.preDelayNode.delayTime.value = clamp(value, MIN_PREDELAY, MAX_PREDELAY);
  }

  /** The cutoff frequency of the damping filters inside of the feedback loop, in Hz. */
  get highCut() { return this._highCut; }
  set highCut(value: number) {
    this._highCut = value;
    this.reverb.setParameter("highCut", value);
  }

  /** The cutoff frequency of the high-pass filters inside of the shimmer loop, in Hz. */
  get lowCut() { return this._lowCut; }
  set lowCut(value: number) {
    this._lowCut = value;
    this.reverb.setParameter("lowCut", value);
  }

  get wet() { return this.wetOut.gain.value; }
  set wet(value: number) {
    value = clamp(value);

    this.wetOut.gain.value = value;
    this.dryOut.gain.value = 1.0 - value;
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.output);
  }

  disconnect() {
    this.output.disconnect();
  }

  dispose() {
    this.disconnect();
    this.input.dispose();
    this.preDelayNode.dispose();
    this.reverb.dispose();
    this.wetOut.dispose();
    this.dryOut.dispose();
    this.output.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.input);
  }
}

export class ShimmerNodeSerializer extends FlatNodeDataSerializer<ShimmerNodeData> {
  type = "shimmer";
  dataFactory = () => new ShimmerNodeData();

  spec = {
    pi: this.prop(self => self.parameters["param-intensity"]).with("controlledBy"),
    pd: this.prop(self => self.parameters["param-decay"]).with("controlledBy"),
    pp: this.prop(self => self.parameters["param-predelay"]).with("controlledBy"),
    pw: this.prop(self => self.parameters["param-wet"]).with("controlledBy"),
    s: this.prop(self => self.effect).with("shift"),
    i: this.prop(self => self.effect).with("intensity"),
    d: this.prop(self => self.effect).with("decay"),
    p: this.prop(self => self.effect).with("preDelay"),
    w: this.prop(self => self.effect).with("wet"),
    z: this.prop(self => self.effect).with("size", 0.7), // since Vestige 0.6.0
    h: this.prop(self => self.effect).with("highCut", 8000), // since Vestige 0.6.0
    l: this.prop(self => self.effect).with("lowCut", 150), // since Vestige 0.6.0
  };
}

export type ShimmerNode = flow.Node<ShimmerNodeData, "shimmer">

/** Creates a new `ShimmerNode` with a random ID. */
export const createShimmerNode = makeNodeFactory("shimmer", () => new ShimmerNodeData());

/** Provides a `NodeTypeDescriptor` which describes shimmer nodes. */
export const SHIMMER_NODE_DESCRIPTOR = {
  displayName: "Shimmer",
  icon: cls => <RiSparklingFill className={cls} />,
  help: <>
    <p>
      The <b>shimmer</b> node is a type of reverb, which pitches the signal up a set amount of
      semitones (the <b>shift</b>) each time it goes through a feedback loop.
      The <b>shimmer</b> parameter determines how much of the signal goes back through the loop.
    </p>

    <p>
      This kind of effect is also called the <b>Eno/Lanois shimmer reverb</b>, as it was first
      popularized by Brian Eno and Daniel Lanois in their ambient works. It works best for acoustic
      instruments and synthesizer pads, and creates great ambiances.
    </p>
  </>,
  create: createShimmerNode
} satisfies NodeTypeDescriptor;

const scalarToHighCut = (x: number) => logLerp(x / 100, LOG_MIN_HIGH_CUT, LOG_MAX_HIGH_CUT);
const highCutToScalar = (x: number) => invLogLerp(x, LOG_MIN_HIGH_CUT, LOG_MAX_HIGH_CUT) * 100;
const scalarToLowCut = (x: number) => logLerp(x / 100, LOG_MIN_LOW_CUT, LOG_MAX_LOW_CUT);
const lowCutToScalar = (x: number) => invLogLerp(x, LOG_MIN_LOW_CUT, LOG_MAX_LOW_CUT) * 100;

export const ShimmerNodeRenderer = memo(function ShimmerNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ShimmerNodeData>>
) {
  const fx = data.effect;

  const [shift, setShift] = useBoundState(fx, "shift");
  const [size, setSize] = useState(fx.size * 100);
  const [intensity, setIntensity] = useState(fx.intensity * 100);
  const [decay, setDecay] = useState(decayToScalar(fx.decay) * 100);
  const [preDelay, setPreDelay] = useState(preDelayToScalar(fx.preDelay) * 100);
  const [highCut, setHighCut] = useState(highCutToScalar(fx.highCut));
  const [lowCut, setLowCut] = useState(lowCutToScalar(fx.lowCut));
  const [wet, setWet] = useState(fx.wet * 100);

  useEffect(() => { fx.size = size / 100 }, [fx, size]);
  useEffect(() => { fx.highCut = scalarToHighCut(highCut) }, [fx, highCut]);
  useEffect(() => { fx.lowCut = scalarToLowCut(lowCut) }, [fx, lowCut]);

  useEffect(() => {
    if (!data.parameters["param-intensity"].isAutomated()) {
      fx.intensity = intensity / 100;
    }
  }, [data, fx, intensity]);

  useEffect(() => {
    if (!data.parameters["param-decay"].isAutomated()) {
      fx.decay = scalarToDecay(decay / 100);
    }
  }, [data, fx, decay]);

  useEffect(() => {
    if (!data.parameters["param-predelay"].isAutomated()) {
      fx.preDelay = scalarToPreDelay(preDelay / 100);
    }
  }, [data, fx, preDelay]);

  useEffect(() => {
    if (!data.parameters["param-wet"].isAutomated()) {
      fx.wet = wet / 100;
    }
  }, [data, fx, wet]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="Shimmer"
      help={SHIMMER_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <div className="flex justify-between gap-4">
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="input" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right" name="output" />
          </NodePort>
        </div>

        <NodePort nodeId={id} handleId={paramHandleId("intensity")} kind="input" type="value">
          <SliderField
            name="shimmer"
            min={0} max={100} value={intensity} isPercentage
            onChange={setIntensity}
            automatable={data.parameters["param-intensity"]}
            automatableDisplay={() => fx.intensity * 100}
          />
        </NodePort>

        <SliderField
          name="shift"
          min={-12} max={24} value={shift}
          valueStringifier={x => `${x > 0 ? "+" : ""}${Math.round(x)} st`}
          onChange={x => setShift(Math.round(x))}
        />

        <NodePort nodeId={id} handleId={paramHandleId("decay")} kind="input" type="value">
          <SliderField
            name="decay"
            min={0} max={100} value={decay} step={0.1}
            valueStringifier={x => `${scalarToDecay(x / 100).toFixed(1)} s`}
            valueParser={x => decayToScalar(x) * 100}
            onChange={setDecay}
            automatable={data.parameters["param-decay"]}
            automatableDisplay={() => decayToScalar(fx.decay) * 100}
          />
        </NodePort>

        <NodePort nodeId={id} handleId={paramHandleId("predelay")} kind="input" type="value">
          <SliderField
            name="pre-delay"
            min={0} max={100} value={preDelay} step={0.1}
            valueStringifier={x => `${Math.round(scalarToPreDelay(x / 100) * 1000)} ms`}
            valueParser={x => preDelayToScalar(x / 1000) * 100}
            onChange={setPreDelay}
            automatable={data.parameters["param-predelay"]}
            automatableDisplay={() => preDelayToScalar(fx.preDelay) * 100}
          />
        </NodePort>

        <SliderField
          name="size"
          min={0} max={100} value={size} isPercentage
          onChange={setSize}
        />

        <div className="grid grid-cols-2 gap-4">
          <SliderField
            name="low cut"
            min={0} max={100} value={lowCut} step={0.1}
            valueStringifier={x => formatFrequency(scalarToLowCut(x))}
            valueParser={x => lowCutToScalar(parseFrequency(x, MIN_FREQUENCY_INPUT))}
            onChange={setLowCut}
          />

          <SliderField
            name="high cut"
            min={0} max={100} value={highCut} step={0.1}
            valueStringifier={x => formatFrequency(scalarToHighCut(x))}
            valueParser={x => highCutToScalar(parseFrequency(x, MIN_FREQUENCY_INPUT))}
            onChange={setHighCut}
          />
        </div>

        <NodePort nodeId={id} handleId={paramHandleId("wet")} kind="input" type="value">
          <SliderField
            name="mix"
            min={0} max={100} value={wet} isPercentage
            onChange={setWet}
            automatable={data.parameters["param-wet"]}
            automatableDisplay={() => fx.wet * 100}
          />
        </NodePort>
      </div>
    </VestigeNodeBase>
  );
});
