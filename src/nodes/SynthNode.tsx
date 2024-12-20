import { memo, useEffect, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { RiVolumeVibrateFill } from "@remixicon/react";
import * as tone from "tone";

import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { SelectField } from "../components/SelectField";
import { SliderField } from "../components/SliderField";

import { AudioGenerator, NoteEvent, InstrumentNodeData, NOTE_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, AudioDestination, paramHandleId } from "../graph";
import { octToCents } from "../audioUtil";
import { makeNodeFactory, NodeTypeDescriptor } from ".";
import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { Automatable } from "../parameters";
import { NodeDataSerializer } from "../serializer";
import { anyOf, lerp, match } from "../util";

const MIN_UNISON_DETUNE = 1; // cents
const MAX_UNISON_DETUNE = 100; // cents

type Countour = "pluck" | "smooth" | "sudden";
type Waveform = "square" | "sawtooth" | "sine";

export class SynthNodeData extends InstrumentNodeData {
  generator: SynthAudioGenerator;
  octave: number = 0;
  fineTune: number = 0;
  contour: Countour = "pluck";
  countourAmt: number = 0.5;
  parameters: {
    "param-fineTune": Automatable,
    "param-unisonDetune": Automatable
  } & Record<string, Automatable>

  applyContour() {
    const x = this.countourAmt;

    let env = match<Countour, Omit<tone.EnvelopeOptions, "context">>(this.contour, {
      "pluck": {
        attack: 1 / 1000, // 1ms, just to prevent clicks
        attackCurve: "linear",
        decay: lerp(170, 3000, x) / 1000,
        decayCurve: "exponential",
        sustain: 0, // 0%
        release: lerp(170, 3000, x) / 1000 / 2, // half of the decay time
        releaseCurve: "exponential"
      },
      "smooth": {
        attack: lerp(200, 4000, x) / 1000,
        attackCurve: "exponential",
        decay: 0,
        decayCurve: "linear",
        sustain: 1, // 100%
        release: lerp(200, 4000, x) / 1000 * 1.5, // 150% of the attack time
        releaseCurve: "exponential"
      },
      "sudden": {
        attack: 0.5 / 1000, // 0.5ms
        attackCurve: "linear",
        decay: 0,
        decayCurve: "linear",
        release: 15 / 1000, // 15ms
        releaseCurve: "linear",
        sustain: 1 // 100%
      }
    });

    this.generator.synth.set({ envelope: env });
  }

  constructor () {
    super();

    this.generator = new SynthAudioGenerator();

    const synth = this.generator.synth;
    this.parameters = {
      "param-fineTune": new Automatable(x => synth.set({ detune: (this.octave * 1200) + ((x * 200) - 100) })),
      "param-unisonDetune": new Automatable(x => this.generator.unisonSpread = lerp(MIN_UNISON_DETUNE, MAX_UNISON_DETUNE, x))
    }
  }
};

export class SynthAudioGenerator implements AudioGenerator {
  synth: tone.PolySynth;
  private _waveform: Waveform = "sine";
  private _unisonSpread: number = 20;
  private _unisonCount: number = 1;

  constructor() {
    this.synth = new tone.PolySynth(tone.Synth, { oscillator: { type: this.waveform} });
  }

  /** Fully applies oscillator settings, changing its type. May produce audible clicks.  */
  private fullyApplyOsc() {
    if (this._unisonCount > 1) {
      this.synth.set({
        oscillator: {
          count: this._unisonCount,
          spread: this._unisonSpread,
          type: match(this._waveform, {
            sawtooth: "fatsawtooth",
            sine: "fatsine",
            square: "fatsquare"
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

export class SynthNodeSerializer implements NodeDataSerializer<SynthNodeData> {
  type = "synth"

  serialize(obj: SynthNodeData) {
    const synth = obj.generator.synth;
    const params = obj.parameters;

    return {
      pf: params["param-fineTune"].controlledBy,
      ps: params["param-unisonDetune"].controlledBy,
      c: obj.contour,
      a: obj.countourAmt,
      o: obj.octave,
      f: obj.fineTune,
      w: obj.generator.waveform,
      v: synth.volume.value,
      s: obj.generator.unisonSpread, // since Vestige 0.2.0
      u: obj.generator.unisonCount // since Vestige 0.2.0
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): SynthNodeData {
    const data = new SynthNodeData();
    const synth = data.generator.synth;
    const params = data.parameters;

    params["param-fineTune"].controlledBy = serialized.pf;
    params["param-unisonDetune"].controlledBy = serialized.ps;
    data.octave = serialized.o;
    data.fineTune = serialized.f;
    data.contour = serialized.c;
    data.countourAmt = serialized.a;
    synth.volume.value = serialized.v;
    data.generator.unisonCount = serialized.u ?? 1; // since Vestige 0.2.0
    data.generator.unisonSpread = serialized.s ?? 0; // since Vestige 0.2.0
    data.generator.waveform = serialized.w;

    data.applyContour();

    return data;
  }
}

export type SynthNode = Node<SynthNodeData, "synth">;

/** Creates a new `SynthNode` with a random ID. */
export const createSynthNode = makeNodeFactory("synth", () => new SynthNodeData());

/** Provides a `NodeTypeDescriptor` which describes synth nodes. */
export const SYNTH_NODE_DESCRIPTOR = {
  displayName: "synth",
  icon: cls => <RiVolumeVibrateFill className={cls}/>,
  create: createSynthNode
} satisfies NodeTypeDescriptor;

export const SynthNodeRenderer = memo(function SynthNodeRenderer(
  { id, data }: NodeProps<Node<SynthNodeData>>
) {
  const [countour, setCountour] = useState<Countour>(data.contour);
  const [countourAmt, setCountourAmt] = useState<number>(data.countourAmt * 100);

  const [waveform, setWaveform] = useState<Waveform>(data.generator.synth.get().oscillator.type as Waveform);
  const [fineTune, setFineTune] = useState(data.fineTune);
  const [octave, setOctave] = useState(data.octave);
  const [volume, setVolume] = useState(tone.dbToGain(data.generator.synth.volume.value) * 100);

  const [unisonVoices, setUnisonVoices] = useState(data.generator.unisonCount);
  const [unisonSpread, setUnisonSpread] = useState(data.generator.unisonSpread);

  useEffect(() => {
    data.generator.waveform = waveform;
  }, [data.generator, waveform]);

  useEffect(() => {
    data.generator.synth.volume.value = tone.gainToDb(volume / 100);
  }, [data.generator, volume]);

  useEffect(() => {
    data.fineTune = fineTune;
    data.octave = octave;
    data.generator.synth.set({ detune: octToCents(octave + 1) + fineTune });
  }, [data, octave, fineTune]);

  useEffect(() => {
    data.contour = countour;
    data.countourAmt = countourAmt / 100;
    data.applyContour();
  }, [data, countour, countourAmt]);

  useEffect(() => {
    data.generator.unisonCount = unisonVoices;
  }, [data, unisonVoices]);

  useEffect(() => {
    data.generator.unisonSpread = unisonSpread;
  }, [data, unisonSpread]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.generator.dispose()}
      name="synth"
      help={<>
        The <b>synth</b> module takes in notes, and outputs audio - more specifically,
        an <b>audio signal</b>. The timbre of the synth is specified by its <b>shape</b>
        (waveform). The countour of the final audio (plucky, smooth, etc...) is controlled
        by the <b>type</b>.

        <br/><br/>
        
        Try combining multiple synths for more interesting textures! It helps to change
        the fine-tune between multiple synths to keep it from sounding bland.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort offset={20} handleId={NOTE_INPUT_HID_MAIN} kind="input" type="notes">
            <PlainField
              name="main input"
              description="the notes to hold down on the synthesizer"
            />
          </NodePort>

          <NodePort offset={80} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the audio coming out of the synthesizer"
            />
          </NodePort>

          <SelectField
            name="type"
            description="the audio countour of the synthesizer"
            value={countour}
            onChange={x => setCountour(x as Countour)}
          >
            <option>pluck</option>
            <option>smooth</option>
            <option>sudden</option>
          </SelectField>

          {!(countour in anyOf("pluck", "smooth")) ? <></>
            : (
              <SliderField
                name={countour == "pluck" ? "pluckiness" : "fade"}
                description={
                  countour == "pluck"
                    ? "how plucky the synth is. higher values = longer plucks"
                    : "how long the synth swells in and out"
                }
                min={0} max={100} value={countourAmt} isPercentage
                onChange={setCountourAmt}
              />
            )
          }

          <SelectField
            name="shape"
            description="the shape of the oscillator, affects its timbre. see help for info."
            value={waveform}
            onChange={x => setWaveform(x as Waveform)}
          >
            <option>square</option>
            <option>sawtooth</option>
            <option>sine</option>
          </SelectField>

          <SliderField
            name="octave"
            description="the large pitch offset of the oscillator. negative values pitch it down, positive pitch it up."
            min={-3} max={3} value={octave}
            onChange={setOctave}
          />

          <NodePort offset={540} handleId={paramHandleId("fineTune")} kind="input" type="value">
            <SliderField
              name="fine-tune"
              description="the tiny pitch offset of the oscillator. useful for detuning. negative values pitch it down, positive pitch it up."
              min={-100} max={100} value={fineTune} isPercentage
              onChange={setFineTune}
              automatable={data.parameters["param-fineTune"]}
              automatableDisplay={() => data.generator.synth.get().detune - (octave * 1200)}
            />
          </NodePort>

          <SliderField
            name="volume"
            description="the volume (mix) of the oscillator"
            min={0} max={100} value={volume} isPercentage
            onChange={setVolume}
          />

          <SliderField
            name="unison voices"
            description="values larger than 1 play multiple version of the synth in unison, slightly detuned. creates a 'fuller', more complex sound."
            min={1} max={16} value={unisonVoices}
            onChange={setUnisonVoices}
          />

          <NodePort offset={844} handleId={paramHandleId("unisonDetune")} kind="input" type="value">
            <SliderField
              name="unison spread"
              description="if there is more than 1 unison voice, sets how much different in pitch the different voices are."
              min={MIN_UNISON_DETUNE} max={MAX_UNISON_DETUNE} value={unisonSpread}
              onChange={setUnisonSpread}
              valueStringifier={x => `${Math.round(x)} cents`}
              automatable={data.parameters["param-unisonDetune"]}
              automatableDisplay={() => data.generator.unisonSpread}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
