import * as flow from "@xyflow/react";
import * as tone from "tone";
import { memo, useEffect, useState } from "react";
import { RiSchoolFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { Automatable, linearUnit, AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { assert, invLogLerp, lerp, logLerp } from "../../util";
import { formatFrequency, parseFrequency } from "../../audioUtil";
import { FlatNodeDataSerializer, FlatSerializerSpec } from "../../serializer";
import { useBoundState } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { SelectField } from "../../components/SelectField";
import { VintageColor, vintageColorName, VintageReverb } from "./VintageReverb";

const MIN_DECAY = 0.1;
const MAX_DECAY = 10;

const MIN_PREDELAY = 0;
const MAX_PREDELAY = 0.5;

const scalarToDecay = (x: number) => lerp(MIN_DECAY, MAX_DECAY, x);
const scalarToPreDelay = (x: number) => lerp(MIN_PREDELAY, MAX_PREDELAY, x);

/** Damping frequencies typed in by the user that are lower than this are in kHz, not Hz. */
const MIN_DAMPING_INPUT = 50;

const LOG_MIN_DAMPING = Math.log10(1000);
const LOG_MAX_DAMPING = Math.log10(20_000);

const DECAY_UNIT = linearUnit(MIN_DECAY, MAX_DECAY, x => `${x.toFixed(2)} s`);
const PREDELAY_UNIT = linearUnit(
  MIN_PREDELAY * 1000,
  MAX_PREDELAY * 1000,
  x => `${Math.round(x)} ms`
);

export class ReverbNodeData extends EffectNodeData {
  effect: ReverbAudioEffect;
  parameters: {
    "param-decay": Automatable,
    "param-predelay": Automatable,
    "param-wet": Automatable
  } & Record<string, Automatable>

  async beforeRender() {
    if (this.effect.algorithm == "TONE") {
      await this.effect.getTone().ready;
    }
  }

  constructor() {
    super();

    this.effect = new ReverbAudioEffect();

    const fx = this.effect;
    this.parameters = {
      "param-decay": new Automatable(x => fx.decay = scalarToDecay(x), DECAY_UNIT),
      "param-predelay": new Automatable(x => fx.preDelay = scalarToPreDelay(x), PREDELAY_UNIT),
      "param-wet": new Automatable(x => fx.wet = x)
    };
  }
};

/** The reverberation algorithm used by a reverb node. */
export type ReverbAlgorithm = "TONE" | "VINTAGE";

/**
 * A reverb with multiple algorithms. "TONE" uses the convolution reverb provided by
 * Tone.js, while "VINTAGE" uses an algorithmic plate reverb modeled after vintage hardware.
 */
export class ReverbAudioEffect implements AudioEffect {
  input = new tone.Gain();
  output = new tone.Gain();

  private toneReverb: tone.Reverb | null = null;
  private vintage: VintageReverb | null = null;
  private _algorithm: ReverbAlgorithm = "VINTAGE";
  private _decay = 4.5;
  private _preDelay = 20 / 1000;
  private _wet = 0.45;
  private _color: VintageColor = "1970S";
  private _size = 1.25;
  private _damping = 3500;

  constructor() {
    this.input.connect(this.getVintage().input);
    this.applyToEngine();
  }

  /** Gets the Tone.js reverb engine, creating it if it doesn't exist yet. */
  getTone() {
    if (!this.toneReverb) {
      this.toneReverb = new tone.Reverb({
        decay: this._decay,
        preDelay: this._preDelay,
        wet: this._wet
      });

      this.toneReverb.connect(this.output);
    }

    return this.toneReverb;
  }

  /** Gets the vintage reverb engine, creating it if it doesn't exist yet. */
  private getVintage() {
    if (!this.vintage) {
      this.vintage = new VintageReverb();
      this.vintage.color = this._color;
      this.vintage.size = this._size;
      this.vintage.damping = this._damping;
      this.vintage.output.connect(this.output);
    }

    return this.vintage;
  }

  /** Applies all shared parameters to the currently active engine. */
  private applyToEngine() {
    if (this._algorithm == "TONE") {
      const reverb = this.getTone();

      // Changing the decay of a Tone.js reverb re-generates its impulse response.
      if (tone.Time(reverb.decay).toSeconds() != this._decay) {
        reverb.decay = this._decay;
      }

      reverb.preDelay = this._preDelay;
      reverb.wet.value = this._wet;
    }
    else {
      const vintage = this.getVintage();
      vintage.decay = this._decay;
      vintage.preDelay = this._preDelay;
      vintage.mix = this._wet;
    }
  }

  get algorithm() { return this._algorithm; }
  set algorithm(value: ReverbAlgorithm) {
    if (value == this._algorithm)
      return;

    this._algorithm = value;
    this.input.disconnect();
    this.input.connect(value == "TONE" ? this.getTone() : this.getVintage().input);
    this.applyToEngine();
  }

  get decay() { return this._decay; }
  set decay(value: number) {
    this._decay = value;
    this.applyToEngine();
  }

  get preDelay() { return this._preDelay; }
  set preDelay(value: number) {
    this._preDelay = value;
    this.applyToEngine();
  }

  get wet() { return this._wet; }
  set wet(value: number) {
    this._wet = value;
    this.applyToEngine();
  }

  get color() { return this._color; }
  set color(value: VintageColor) {
    this._color = value;

    if (this.vintage) {
      this.vintage.color = value;
    }
  }

  get size() { return this._size; }
  set size(value: number) {
    this._size = value;

    if (this.vintage) {
      this.vintage.size = value;
    }
  }

  get damping() { return this._damping; }
  set damping(value: number) {
    this._damping = value;

    if (this.vintage) {
      this.vintage.damping = value;
    }
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
    this.toneReverb?.dispose();
    this.vintage?.dispose();
    this.output.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.input);
  }
}

export class ReverbNodeSerializer extends FlatNodeDataSerializer<ReverbNodeData> {
  type = "reverb";
  dataFactory = () => new ReverbNodeData();

  spec: FlatSerializerSpec<ReverbNodeData> = {
    pd: this.prop(self => self.parameters["param-decay"]).with("controlledBy"),
    pp: this.prop(self => self.parameters["param-predelay"]).with("controlledBy"),
    pw: this.prop(self => self.parameters["param-wet"]).with("controlledBy"),
    w: this.prop(self => self.effect).with("wet"),
    d: this.prop(self => self.effect).with("decay"),
    p: this.prop(self => self.effect).with("preDelay"),
    vc: this.prop(self => self.effect).with("color", "1970S"), // since Vestige 0.6.0
    vz: this.prop(self => self.effect).with("size", 1.25), // since Vestige 0.6.0
    vd: this.prop(self => self.effect).with("damping", 3500), // since Vestige 0.6.0

    // Projects saved before Vestige 0.6.0 only had the Tone.js algorithm.
    g: this.prop(self => self.effect).with("algorithm", "TONE") // since Vestige 0.6.0
  };
}

export type ReverbNode = flow.Node<ReverbNodeData, "reverb">

/** Creates a new `ReverbNode` with a random ID. */
export const createReverbNode = makeNodeFactory("reverb", () => new ReverbNodeData());

/** Provides a `NodeTypeDescriptor` which describes reverb nodes. */
export const REVERB_NODE_DESCRIPTOR = {
  displayName: "Reverb",
  icon: cls => <RiSchoolFill className={cls}/>,
  help: <>
    <p>
      The <b>reverb</b> node provides a sense of depth to the sound, making it sound like it's
      in an actual room. The <b>decay</b> determines how long the reverb takes to go away.
      Higher <b>pre-delay</b> values help with preserving short and snappy attacks.
    </p>

    <p>
      The <b>Vintage</b> algorithm is modeled after classic digital reverbs. Older
      values of <b>color</b> sound darker and more modulated. If you want to automate the decay,
      prefer this algorithm over <b>Tone.js</b>.
    </p>
  </>,
  create: createReverbNode
} satisfies NodeTypeDescriptor;

const scalarToDamping = (x: number) => logLerp(x / 100, LOG_MIN_DAMPING, LOG_MAX_DAMPING);
const dampingToScalar = (x: number) => invLogLerp(x, LOG_MIN_DAMPING, LOG_MAX_DAMPING) * 100;

export const ReverbNodeRenderer = memo(function ReverbNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ReverbNodeData>>
) {
  const fx = data.effect;

  const [algorithm, setAlgorithm] = useBoundState(fx, "algorithm");
  const [color, setColor] = useBoundState(fx, "color");
  const [size, setSize] = useState(fx.size * 100);
  const [damping, setDamping] = useState(dampingToScalar(fx.damping));
  const [decay, setDecay] = useState(fx.decay);
  const [preDelay, setPreDelay] = useState(fx.preDelay);
  const [wet, setWet] = useState(fx.wet * 100);

  useEffect(() => { fx.size = size / 100 }, [fx, size]);
  useEffect(() => { fx.damping = scalarToDamping(damping) }, [fx, damping]);

  useEffect(() => {
    if (!data.parameters["param-decay"].isAutomated()) {
      fx.decay = decay;
    }
  }, [data, fx, decay]);

  useEffect(() => {
    if (!data.parameters["param-predelay"].isAutomated()) {
      fx.preDelay = preDelay;
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
      name="Reverb"
      help={REVERB_NODE_DESCRIPTOR.help}
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

        <div className={`grid gap-4 ${algorithm == "VINTAGE" ? "grid-cols-2" : "grid-cols-1"}`}>
          <SelectField
            name="algorithm"
            value={algorithm}
            onChange={x => setAlgorithm(x as ReverbAlgorithm)}
          >
            <option value="TONE">Tone.js</option>
            <option value="VINTAGE">Vintage</option>
          </SelectField>

          {
            algorithm != "VINTAGE" ? <></> : (
              <SelectField
                name="color"
                value={color}
                onChange={x => setColor(x as VintageColor)}
              >
                {
                  (["1970S", "1980S", "NOW"] as const).map(x =>
                    <option key={x} value={x}>{vintageColorName(x)}</option>
                  )
                }
              </SelectField>
            )
          }
        </div>

        <NodePort nodeId={id} handleId={paramHandleId("decay")} kind="input" type="value">
          <SliderField
            name="decay"
            min={MIN_DECAY} max={MAX_DECAY} value={decay} step={0.1}
            valueStringifier={x => `${x.toFixed(2)} s`}
            onChange={setDecay}
            automatable={data.parameters["param-decay"]}
            automatableDisplay={() => fx.decay}
          />
        </NodePort>

        <NodePort nodeId={id} handleId={paramHandleId("predelay")} kind="input" type="value">
          <SliderField
            name="pre-delay"
            min={MIN_PREDELAY} max={MAX_PREDELAY} value={preDelay} step={1 / 1000}
            onChange={setPreDelay}
            automatable={data.parameters["param-predelay"]}
            automatableDisplay={() => fx.preDelay}
            valueStringifier={x => `${(x * 1000).toFixed(0)} ms`}
            valueParser={x => x / 1000}
          />
        </NodePort>

        {
          algorithm != "VINTAGE" ? <></> : (
            <div className="grid grid-cols-2 gap-4">
              <SliderField
                name="size"
                min={50} max={200} value={size} isPercentage
                onChange={setSize}
              />

              <SliderField
                name="damping"
                min={0} max={100} value={damping} step={0.1}
                valueStringifier={x => formatFrequency(scalarToDamping(x))}
                valueParser={x => dampingToScalar(parseFrequency(x, MIN_DAMPING_INPUT))}
                onChange={setDamping}
              />
            </div>
          )
        }

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
