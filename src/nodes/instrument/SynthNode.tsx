import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiVolumeVibrateFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { Automatable, linearUnit, ParameterUnit, AudioGenerator, NoteEvent, InstrumentNodeData, NOTE_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, AudioDestination, paramHandleId } from "../../graph";
import { octToCents, formatGain, formatMilliseconds } from "../../audioUtil";
import { FlatNodeDataSerializer } from "../../serializer";
import { lerp, logLerp, invLogLerp, match, randInt, range } from "../../util";
import { useBoundState } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { SelectField } from "../../components/SelectField";
import { CheckboxField } from "../../components/CheckboxField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { ParamGroup } from "../../components/ParamGroup";
import { AudioScope } from "../../components/viz/AudioScope";
import { clearViz, LABEL_HEIGHT, LABEL_MARGIN, strokeCurve, strokePoints, VIZ_COLORS, VizCanvas, vizLabel } from "../../components/viz/VizCanvas";

const MIN_UNISON_DETUNE = 1; // cents
const MAX_UNISON_DETUNE = 200; // cents

type Waveform = "square" | "sawtooth" | "sine" | "triangle";

/**
 * Represents an ADSR envelope. All times are in seconds, and `sustain` is in the range
 * of 0.0 to 1.0.
 */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

const ENVELOPE_PRESETS = {
  "pluck": { attack: 0.001, decay: 0.6, sustain: 0, release: 0.3 },
  "keys": { attack: 0.005, decay: 1.2, sustain: 0.3, release: 0.6 },
  "pad": { attack: 1.5, decay: 1, sustain: 0.8, release: 3 },
  "swell": { attack: 3, decay: 0.001, sustain: 1, release: 4 },
  "gate": { attack: 0.001, decay: 0.001, sustain: 1, release: 0.015 }
} satisfies Record<string, Envelope>;

type EnvelopePreset = keyof typeof ENVELOPE_PRESETS;

const LOG_MIN_ENV_TIME = -3; // 1 ms
const LOG_MAX_ATTACK = 1; // 10 s
const LOG_MAX_DECAY = 1; // 10 s
const LOG_MAX_RELEASE = Math.log10(20); // 20 s

const scalarToAttack = (x: number) => logLerp(x, LOG_MIN_ENV_TIME, LOG_MAX_ATTACK);
const attackToScalar = (x: number) => invLogLerp(x, LOG_MIN_ENV_TIME, LOG_MAX_ATTACK);
const scalarToDecay = (x: number) => logLerp(x, LOG_MIN_ENV_TIME, LOG_MAX_DECAY);
const decayToScalar = (x: number) => invLogLerp(x, LOG_MIN_ENV_TIME, LOG_MAX_DECAY);
const scalarToRelease = (x: number) => logLerp(x, LOG_MIN_ENV_TIME, LOG_MAX_RELEASE);
const releaseToScalar = (x: number) => invLogLerp(x, LOG_MIN_ENV_TIME, LOG_MAX_RELEASE);

const FINE_TUNE_UNIT = linearUnit(-100, 100, x => `${Math.round(x)} ct`);
const SPREAD_UNIT = linearUnit(MIN_UNISON_DETUNE, MAX_UNISON_DETUNE, x => `${Math.round(x)} ct`);

/** Creates a `ParameterUnit` for envelope times, displayed in milliseconds. */
function makeEnvTimeUnit(
  fromScalar: (x: number) => number,
  toScalar: (x: number) => number
): ParameterUnit {
  return {
    format: x => `${Math.round(fromScalar(x) * 1000)} ms`,
    parse: x => toScalar(x / 1000)
  };
}

const ATTACK_UNIT = makeEnvTimeUnit(scalarToAttack, attackToScalar);
const DECAY_UNIT = makeEnvTimeUnit(scalarToDecay, decayToScalar);
const RELEASE_UNIT = makeEnvTimeUnit(scalarToRelease, releaseToScalar);

/** The envelope types used before Vestige 0.6.0. */
type LegacyContour = "pluck" | "smooth" | "sudden";

/**
 * Converts the envelope types used before Vestige 0.6.0 (a fixed contour with a single
 * "amount" parameter) to an equivalent ADSR envelope.
 */
function legacyContourToEnvelope(contour: LegacyContour, amount: number): Envelope {
  const pluckLength = lerp(170, 3000, amount) / 1000;
  const smoothLength = lerp(200, 4000, amount) / 1000;

  return match(contour, {
    "pluck": {
      attack: 0.001,
      decay: pluckLength,
      sustain: 0,
      release: pluckLength / 2
    },
    "smooth": {
      attack: smoothLength,
      decay: 0.001,
      sustain: 1,
      release: smoothLength * 1.5
    },
    "sudden": {
      attack: 0.001,
      decay: 0.001,
      sustain: 1,
      release: 0.015
    }
  });
}

export class SynthNodeData extends InstrumentNodeData {
  generator: SynthAudioGenerator;
  octave: number = 0;
  fineTune: number = 0;
  envelope: Envelope = { ...ENVELOPE_PRESETS.pluck };
  parameters: {
    "param-fineTune": Automatable,
    "param-unisonDetune": Automatable,
    "param-attack": Automatable,
    "param-decay": Automatable,
    "param-sustain": Automatable,
    "param-release": Automatable
  };

  applyEnvelope() {
    this.generator.synth.set({
      envelope: {
        attack: this.envelope.attack,
        attackCurve: "linear",
        decay: this.envelope.decay,
        decayCurve: "exponential",
        sustain: this.envelope.sustain,
        release: this.envelope.release,
        releaseCurve: "exponential"
      }
    });
  }

  applyTransposition() {
    this.generator.synth.set({ detune: octToCents(this.octave + 1) + this.fineTune });
  }

  /** Returns an `Automatable` that changes the given stage of the envelope. */
  private envelopeAutomatable(
    key: keyof Envelope,
    fromScalar: (x: number) => number,
    unit?: ParameterUnit
  ) {
    return new Automatable(x => {
      this.envelope[key] = fromScalar(x);
      this.applyEnvelope();
    }, unit);
  }

  constructor () {
    super();

    this.generator = new SynthAudioGenerator();

    const synth = this.generator.synth;
    this.parameters = {
      "param-fineTune": new Automatable(
        x => synth.set({ detune: octToCents(this.octave + 1) + ((x * 200) - 100) }),
        FINE_TUNE_UNIT
      ),
      "param-unisonDetune": new Automatable(
        x => this.generator.unisonSpread = lerp(MIN_UNISON_DETUNE, MAX_UNISON_DETUNE, x),
        SPREAD_UNIT
      ),
      "param-attack": this.envelopeAutomatable(
        "attack",
        scalarToAttack,
        ATTACK_UNIT
      ),
      "param-decay": this.envelopeAutomatable(
        "decay",
        scalarToDecay,
        DECAY_UNIT
      ),
      "param-sustain": this.envelopeAutomatable("sustain", x => x),
      "param-release": this.envelopeAutomatable(
        "release",
        scalarToRelease,
        RELEASE_UNIT
      )
    };

    this.applyEnvelope();
  }
};

/**
 * The number of distinct phases that unison voices can start at. This has to be limited, as
 * Tone.js caches a periodic wave for each phase.
 */
const RANDOM_PHASE_STEPS = 24;

/** Assigns a random starting phase to each stopped unison oscillator of the given voice. */
function randomizeUnisonPhases(voice: tone.Synth) {
  // Tone.js doesn't expose the individual oscillators of a fat oscillator, so we have to
  // reach into its internals. Check `FatOscillator` in Tone.js if this stops working.
  const fatOscillator = (voice.oscillator as any)._oscillator;
  const oscillators: tone.Oscillator[] = fatOscillator?._oscillators ?? [];

  for (const oscillator of oscillators) {
    if (oscillator.state == "stopped") {
      oscillator.phase = randInt(0, RANDOM_PHASE_STEPS - 1) * (360 / RANDOM_PHASE_STEPS);
    }
  }
}

export class SynthAudioGenerator implements AudioGenerator {
  synth: tone.PolySynth;
  private _waveform: Waveform = "sine";
  private _unisonSpread: number = 20;
  private _unisonCount: number = 1;

  /** If `true`, each unison voice starts at a random phase on every note. */
  randomPhase = true;

  constructor() {
    this.synth = new tone.PolySynth(tone.Synth, { oscillator: { type: this.waveform} });

    // Tone.js starts all unison voices at the same, evenly spaced phases on every note,
    // which makes each note begin with an identical, laser-like sweep. Voices are only
    // handed out when silent, so we can change their phases before they start.
    const polySynth = this.synth as any;
    const getNextVoice = polySynth._getNextAvailableVoice.bind(polySynth);
    polySynth._getNextAvailableVoice = () => {
      const voice: tone.Synth | undefined = getNextVoice();
      const shouldRandomize = this.randomPhase && this._unisonCount > 1;

      if (voice && shouldRandomize) {
        randomizeUnisonPhases(voice);
      }

      return voice;
    };
  }

  /** Fully applies oscillator settings, changing its type. May produce audible clicks.  */
  fullyApplyOsc() {
    this.synth.releaseAll();

    if (this._unisonCount > 1) {
      this.synth.set({
        oscillator: {
          count: this._unisonCount,
          spread: this._unisonSpread,
          type: match(this._waveform, {
            sawtooth: "fatsawtooth",
            sine: "fatsine",
            square: "fatsquare",
            triangle: "fattriangle"
          })
        }
      });
    } else {
      this.synth.set({ oscillator: { type: this._waveform } });
    }
  }

  get waveform() { return this._waveform; }
  set waveform(value: Waveform) {
    this._waveform = value;
    this.fullyApplyOsc();
  }

  get unisonCount() { return this._unisonCount; }
  set unisonCount(value: number) {
    const prev = this._unisonCount;
    const next = value;

    this._unisonCount = value;

    if (
      (prev <= 1 && next > 1) || // wasn't unisono before, but now it is
      (prev > 1 && next <= 1)    // was unisono before, but now it isn't
    ) {
      this.fullyApplyOsc();
    } else if (next > 1) {
      // The unison state itself doesn't change, but the count does.
      this.synth.set({ oscillator: { count: value } });
    }
  }

  get unisonSpread() { return this._unisonSpread; }
  set unisonSpread(value: number)  {
    this._unisonSpread = value;

    if (this._unisonCount > 1) {
      this.synth.set({ oscillator: { spread: value } })
    }
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.synth);
  }

  disconnect() {
    this.synth.disconnect();
  }

  dispose() {
    this.disconnect();
    this.synth.dispose();
  }

  accept(events: NoteEvent[]): void {
    for (const event of events) {
      const freq = tone.Frequency(event.pitch, "midi").toFrequency();

      if (event.type === "NOTE_ON") {
        this.synth.triggerAttack(freq);
      } else {
        this.synth.triggerRelease(freq);
      }
    }
  }
}

export class SynthNodeSerializer extends FlatNodeDataSerializer<SynthNodeData> {
  type = "synth";
  dataFactory = () => new SynthNodeData();

  /** The envelope type used by projects saved before Vestige 0.6.0, if any. */
  private legacyContour?: LegacyContour;

  spec = {
    pf: this.prop(self => self.parameters["param-fineTune"]).with("controlledBy"),
    ps: this.prop(self => self.parameters["param-unisonDetune"]).with("controlledBy"),
    pa: this.prop(self => self.parameters["param-attack"]).with("controlledBy"), // since Vestige 0.6.0
    pd: this.prop(self => self.parameters["param-decay"]).with("controlledBy"), // since Vestige 0.6.0
    pu: this.prop(self => self.parameters["param-sustain"]).with("controlledBy"), // since Vestige 0.6.0
    pr: this.prop(self => self.parameters["param-release"]).with("controlledBy"), // since Vestige 0.6.0
    c: {
      // Only present in projects saved before Vestige 0.6.0.
      get: () => undefined,
      set: (_: SynthNodeData, x?: LegacyContour) => this.legacyContour = x
    },
    a: {
      // Only present in projects saved before Vestige 0.6.0. Always comes after "c".
      get: () => undefined,
      set: (self: SynthNodeData, x: number | undefined) => {
        if (this.legacyContour && x !== undefined) {
          self.envelope = legacyContourToEnvelope(this.legacyContour, x);
        }
      }
    },
    e: {
      get: (self: SynthNodeData) => {
        const { attack, decay, sustain, release } = self.envelope;
        return [attack, decay, sustain, release];
      },
      set: (self: SynthNodeData, x: number[] | undefined) => {
        if (x) {
          self.envelope = { attack: x[0], decay: x[1], sustain: x[2], release: x[3] };
        }
      }
    },
    o: this.prop("octave"),
    f: this.prop("fineTune"),
    w: this.prop(self => self.generator).with("waveform"),
    v: this.prop(self => self.generator.synth.volume).with("value"),
    s: this.prop(self => self.generator).with("unisonSpread", 1), // since Vestige 0.2.0
    u: this.prop(self => self.generator).with("unisonCount", 0), // since Vestige 0.2.0
    r: this.prop(self => self.generator).with("randomPhase", false), // since Vestige 0.6.0
  };

  protected override beforeDeserialize(): void {
    this.legacyContour = undefined;
  }

  protected override afterSerialize(serialized: Record<string, any>): void {
    delete serialized.c;
    delete serialized.a;
  }

  protected override afterDeserialize(data: SynthNodeData): void {
    data.applyEnvelope();
    data.applyTransposition();
    data.generator.fullyApplyOsc();
  }
}

export type SynthNode = flow.Node<SynthNodeData, "synth">;

/** Creates a new `SynthNode` with a random ID. */
export const createSynthNode = makeNodeFactory("synth", () => new SynthNodeData());

/** Provides a `NodeTypeDescriptor` which describes synth nodes. */
export const SYNTH_NODE_DESCRIPTOR = {
  displayName: "Synth",
  icon: cls => <RiVolumeVibrateFill className={cls}/>,
  help: <>
    <p>
      The <b>synth</b> node takes in notes, and outputs audio. The timbre of the synth is specified
      by its <b>waveform</b>. The contour of the final audio (plucky, smooth, etc...) is controlled
      by the <b>envelope</b>.
    </p>

    <p>
      Try combining multiple synths for more interesting textures! It helps to change
      the <b>fine</b> tune between multiple synths, or to add more <b>unison</b> voices, to keep it
      from sounding bland.
    </p>
  </>,
  create: createSynthNode
} satisfies NodeTypeDescriptor;

/** The amount of cycles of the waveform that are displayed when no notes are playing. */
const IDLE_CYCLES = 2;

/** The portion of the height of the scope that the waveform takes up when no notes are playing. */
const IDLE_AMPLITUDE = 0.7;

/** Evaluates a single cycle of the given waveform at `phase` (0.0 to 1.0). */
function waveformAt(waveform: Waveform, phase: number) {
  return match(waveform, {
    sine: Math.sin(phase * Math.PI * 2),
    triangle: 1 - 4 * Math.abs(((phase + 0.25) % 1) - 0.5),
    square: phase < 0.5 ? 1 : -1,
    sawtooth: 2 * ((phase + 0.5) % 1) - 1
  });
}

/**
 * The width of the sustain segment of an envelope graph, relative to the square root of
 * the times of other segments.
 */
const SUSTAIN_GRAPH_WIDTH = 0.7;

/** The distance between an envelope graph and the edges of the canvas, in pixels. */
const GRAPH_PADDING = 6;

/** The amount of points that exponential segments of an envelope graph are made out of. */
const EXPONENTIAL_POINTS = 24;

/** The width of the narrowest segment that has enough room for its label, in pixels. */
const MIN_LABELED_WIDTH = 10;

/** Evaluates an exponential segment of an envelope, which goes from 1.0 to 0.0. */
function exponentialFalloff(t: number) {
  return Math.exp(-5 * t) * (1 - t);
}

/** Returns `true` if two percentages are too close to each other to be told apart by the user. */
function isApprox(a: number, b: number) {
  return Math.abs(a - b) < 0.5;
}

/** Draws the shape of an ADSR envelope. */
function EnvelopeGraph({ envelope }: { envelope: Envelope }) {
  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const { attack, decay, sustain, release } = envelope;

    // We use square roots of times, so that short and long stages are both readable.
    const attackWidth = Math.sqrt(attack);
    const decayWidth = Math.sqrt(decay);
    const releaseWidth = Math.sqrt(release);
    const totalWidth = attackWidth + decayWidth + SUSTAIN_GRAPH_WIDTH + releaseWidth;
    const scale = (width - GRAPH_PADDING * 2) / totalWidth;

    const top = GRAPH_PADDING + LABEL_HEIGHT;
    const bottom = height - GRAPH_PADDING;
    const levelToY = (x: number) => bottom - x * (bottom - top);

    const attackX = GRAPH_PADDING;
    const decayX = attackX + attackWidth * scale;
    const sustainX = decayX + decayWidth * scale;
    const releaseX = sustainX + SUSTAIN_GRAPH_WIDTH * scale;
    const endX = releaseX + releaseWidth * scale;

    clearViz(ctx, width, height);

    const steps = range(1, EXPONENTIAL_POINTS).map(i => i / EXPONENTIAL_POINTS);
    const curve = new Path2D();
    curve.lineTo(attackX, levelToY(0));
    curve.lineTo(decayX, levelToY(1));

    // The decay and release are exponential, so we approximate them with a few points.
    for (const t of steps) {
      const level = lerp(sustain, 1, exponentialFalloff(t));
      curve.lineTo(lerp(decayX, sustainX, t), levelToY(level));
    }

    curve.lineTo(releaseX, levelToY(sustain));

    for (const t of steps) {
      const level = sustain * exponentialFalloff(t);
      curve.lineTo(lerp(releaseX, endX, t), levelToY(level));
    }

    const area = new Path2D(curve);
    area.lineTo(attackX, levelToY(0));
    area.closePath();

    ctx.fillStyle = VIZ_COLORS.primaryFaint;
    ctx.fill(area);

    strokeCurve(ctx, curve);

    const stages = [
      { label: "A", from: attackX, to: decayX },
      { label: "D", from: decayX, to: sustainX },
      { label: "S", from: sustainX, to: releaseX },
      { label: "R", from: releaseX, to: endX }
    ];

    for (const { label, from, to } of stages) {
      if (to - from >= MIN_LABELED_WIDTH) {
        vizLabel(
          ctx,
          label,
          (from + to) / 2,
          LABEL_MARGIN,
          "center"
        );
      }
    }
  }

  return <VizCanvas draw={draw} height={64} />;
}

export const SynthNodeRenderer = memo(function SynthNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<SynthNodeData>>
) {
  const gen = data.generator;

  const [attack, setAttack] = useState(attackToScalar(data.envelope.attack) * 100);
  const [decay, setDecay] = useState(decayToScalar(data.envelope.decay) * 100);
  const [sustain, setSustain] = useState(data.envelope.sustain * 100);
  const [release, setRelease] = useState(releaseToScalar(data.envelope.release) * 100);

  const [waveform, setWaveform] = useBoundState(gen, "waveform");
  const [fineTune, setFineTune] = useState(data.fineTune);
  const [octave, setOctave] = useState(data.octave);
  const [volume, setVolume] = useState(tone.dbToGain(gen.synth.volume.value) * 100);

  const [unisonVoices, setUnisonVoices] = useBoundState(gen, "unisonCount");
  const [unisonSpread, setUnisonSpread] = useBoundState(gen, "unisonSpread");
  const [randomPhase, setRandomPhase] = useBoundState(gen, "randomPhase");

  useEffect(() => {
    gen.synth.volume.value = tone.gainToDb(volume / 100);
  }, [gen, volume]);

  useEffect(() => {
    data.fineTune = fineTune;
    data.octave = octave;
    data.applyTransposition();
  }, [data, gen, octave, fineTune]);

  useEffect(() => {
    const params = data.parameters;

    if (!params["param-attack"].isAutomated()) {
      params["param-attack"].change(attack / 100);
    }

    if (!params["param-decay"].isAutomated()) {
      params["param-decay"].change(decay / 100);
    }

    if (!params["param-sustain"].isAutomated()) {
      params["param-sustain"].change(sustain / 100);
    }

    if (!params["param-release"].isAutomated()) {
      params["param-release"].change(release / 100);
    }
  }, [data, attack, decay, sustain, release]);

  const activePreset = (Object.keys(ENVELOPE_PRESETS) as EnvelopePreset[])
    .find(name => {
      const preset = ENVELOPE_PRESETS[name];

      return (
        isApprox(attackToScalar(preset.attack) * 100, attack) &&
        isApprox(decayToScalar(preset.decay) * 100, decay) &&
        isApprox(preset.sustain * 100, sustain) &&
        isApprox(releaseToScalar(preset.release) * 100, release)
      );
    }) ?? "custom";

  function applyPreset(name: EnvelopePreset) {
    const preset = ENVELOPE_PRESETS[name];
    setAttack(attackToScalar(preset.attack) * 100);
    setDecay(decayToScalar(preset.decay) * 100);
    setSustain(preset.sustain * 100);
    setRelease(releaseToScalar(preset.release) * 100);
  }

  function drawIdle(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const points = range(Math.floor(width) + 1).map(x => {
      const phase = (x / width * IDLE_CYCLES) % 1;
      const amplitude = (height / 2) * IDLE_AMPLITUDE;
      return { x, y: (height / 2) - waveformAt(gen.waveform, phase) * amplitude };
    });

    strokePoints(ctx, points, VIZ_COLORS.muted);
  }

  return (
    <VestigeNodeBase
      id={id} onRemove={() => gen.dispose()}
      name="Synth"
      help={SYNTH_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <div className="flex justify-between gap-4">
          <NodePort nodeId={id} handleId={NOTE_INPUT_HID_MAIN} kind="input" type="notes">
            <PlainField name="notes" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right" name="output" />
          </NodePort>
        </div>

        <AudioScope source={gen.synth} idle={drawIdle} />

        <ParamGroup name="oscillator">
          <SelectField
            name="waveform"
            value={waveform}
            onChange={x => setWaveform(x as Waveform)}
          >
            <option value="sine">sine</option>
            <option value="triangle">triangle</option>
            <option value="square">square</option>
            <option value="sawtooth">saw</option>
          </SelectField>

          <div className="grid grid-cols-2 gap-4">
            <NodePort nodeId={id} handleId={paramHandleId("fineTune")} kind="input" type="value">
              <SliderField
                name="fine"
                min={-100} max={100} value={fineTune}
                valueStringifier={x => `${Math.round(x)} ct`}
                onChange={setFineTune}
                automatable={data.parameters["param-fineTune"]}
                automatableDisplay={() => gen.synth.get().detune - octToCents(octave + 1)}
              />
            </NodePort>

            <SliderField
              name="octave"
              min={-3} max={3} value={octave}
              valueStringifier={x => x > 0 ? `+${x}` : `${x}`}
              onChange={x => setOctave(Math.round(x))}
            />
          </div>

          <SliderField
            name="volume"
            min={0} max={100} value={volume}
            valueStringifier={x => formatGain(x / 100)}
            valueParser={x => tone.dbToGain(x) * 100}
            onChange={setVolume}
          />
        </ParamGroup>

        <ParamGroup name="envelope">
          <SelectField
            name="preset"
            value={activePreset}
            onChange={x => applyPreset(x as EnvelopePreset)}
          >
            { activePreset != "custom" ? <></> : <option value="custom" disabled>custom</option> }
            { Object.keys(ENVELOPE_PRESETS).map(x => <option key={x} value={x}>{x}</option>) }
          </SelectField>

          <EnvelopeGraph envelope={data.envelope} />

          <NodePort nodeId={id} handleId={paramHandleId("attack")} kind="input" type="value">
            <SliderField
              name="attack"
              min={0} max={100} value={attack} step={0.1}
              valueStringifier={x => formatMilliseconds(scalarToAttack(x / 100))}
              valueParser={x => attackToScalar(x / 1000) * 100}
              onChange={setAttack}
              automatable={data.parameters["param-attack"]}
              automatableDisplay={() => attackToScalar(data.envelope.attack) * 100}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("decay")} kind="input" type="value">
            <SliderField
              name="decay"
              min={0} max={100} value={decay} step={0.1}
              valueStringifier={x => formatMilliseconds(scalarToDecay(x / 100))}
              valueParser={x => decayToScalar(x / 1000) * 100}
              onChange={setDecay}
              automatable={data.parameters["param-decay"]}
              automatableDisplay={() => decayToScalar(data.envelope.decay) * 100}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("sustain")} kind="input" type="value">
            <SliderField
              name="sustain"
              min={0} max={100} value={sustain} isPercentage
              onChange={setSustain}
              automatable={data.parameters["param-sustain"]}
              automatableDisplay={() => data.envelope.sustain * 100}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("release")} kind="input" type="value">
            <SliderField
              name="release"
              min={0} max={100} value={release} step={0.1}
              valueStringifier={x => formatMilliseconds(scalarToRelease(x / 100))}
              valueParser={x => releaseToScalar(x / 1000) * 100}
              onChange={setRelease}
              automatable={data.parameters["param-release"]}
              automatableDisplay={() => releaseToScalar(data.envelope.release) * 100}
            />
          </NodePort>
        </ParamGroup>

        <ParamGroup name="unison">
          <div className="grid grid-cols-2 gap-4">
            <NodePort nodeId={id} handleId={paramHandleId("unisonDetune")} kind="input" type="value">
              <SliderField
                name="spread"
                min={MIN_UNISON_DETUNE} max={MAX_UNISON_DETUNE} value={unisonSpread}
                onChange={setUnisonSpread}
                valueStringifier={x => `${Math.round(x)} ct`}
                automatable={data.parameters["param-unisonDetune"]}
                automatableDisplay={() => gen.unisonSpread}
              />
            </NodePort>

            <SliderField
              name="unison"
              min={1} max={16} value={unisonVoices}
              valueStringifier={x => `${x} ${x == 1 ? "voice" : "voices"}`}
              onChange={x => setUnisonVoices(Math.round(x))}
            />
          </div>

          <CheckboxField name="random phase" value={randomPhase} onChange={setRandomPhase} />
        </ParamGroup>
      </div>
    </VestigeNodeBase>
  );
});
