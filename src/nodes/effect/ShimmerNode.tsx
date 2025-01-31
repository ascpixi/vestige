import * as flow from "@xyflow/react";
import * as tone from "tone";
import { memo, useEffect, useState } from "react";
import { RiSparklingFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { Automatable } from "../../parameters";
import { assert, clamp, last, lerp } from "../../util";
import { FlatNodeDataSerializer } from "../../serializer";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { useBoundState } from "../../hooks";
import { NumberField } from "../../components/NumberField";

const MIN_DECAY = 0.1;
const MAX_DECAY = 10;

const MIN_PREDELAY = 0;
const MAX_PREDELAY = 0.5;

const scalarToDecay = (x: number) => lerp(MIN_DECAY, MAX_DECAY, x);
const scalarToPreDelay = (x: number) => lerp(MIN_PREDELAY, MAX_PREDELAY, x);

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
      "param-decay": new Automatable(x => this.effect.decay = scalarToDecay(x)),
      "param-predelay": new Automatable(x => this.effect.preDelay = scalarToPreDelay(x)),
      "param-wet": new Automatable(x => this.effect.wet = x)
    };
  }
};

/**
 * Represents a single order - that is, effect tap - of the shimmer effect. 
 */
class ShimmerTap {
  input: tone.ToneAudioNode;
  output: tone.ToneAudioNode;

  reverb: tone.Reverb = new tone.Reverb({
    decay: 4.00,
    preDelay: 60 / 1000,
    wet: 1.0
  });

  pitchShift = new tone.PitchShift(7);
  chainOut = new tone.Gain(0.5);

  constructor(input: tone.ToneAudioNode, output: tone.ToneAudioNode) {
    this.input = input;
    this.output = output;

    this.input.connect(this.pitchShift);
    this.pitchShift.connect(this.reverb);

    // Affected signal flows in its entirety to the final output, and scaled by an "intensity" value
    // to the chain output, which flows to the next order, if one exists.
    this.reverb.connect(this.output);
    this.reverb.connect(this.chainOut);
  }

  dispose() {
    this.reverb.dispose();
    this.pitchShift.dispose();
    this.chainOut.dispose();
  }
}

export class ShimmerAudioEffect implements AudioEffect {
  taps: ShimmerTap[] = [];
  input = new tone.Gain();
  masterReverb = new tone.JCReverb({
    roomSize: 0.7,
    wet: 0.9
  });

  wetOut = new tone.Gain(0.25);
  dryOut = new tone.Gain(1.0 - 0.25);
  output = new tone.Gain();

  get order() { return this.taps.length; }
  set order(value: number) {
    if (this.taps.length == value)
      return;

    if (value < 1)
      throw new Error(`Cannot set 'order' to a value less than 1. (got ${value})`);

    const prev = this.order;

    if (value > prev) {
      // We're increasing the order. Add more taps.
      for (let i = 0; i < value - prev; i++) {
        const input = this.taps.length > 0 ? last(this.taps).chainOut : this.input;
        this.taps.push(new ShimmerTap(input, this.masterReverb));
      }
    } else {
      // We're decreasing the order. Remove the taps at the end.
      for (let i = 0; i < prev - value; i++) {
        const tap = this.taps.pop();
        if (!tap)
          throw new Error("this.taps.pop() returned a non-truthy value when removing taps");

        tap.pitchShift.disconnect();
        tap.dispose();
      }
    }
  }

  get shift() { return this.taps[0].pitchShift.pitch; }
  set shift(value: number) {
    this.taps.forEach(x => x.pitchShift.pitch = value);
  }

  get intensity() { return this.taps[0].chainOut.gain.value; }
  set intensity(value: number) {
    this.taps.forEach(x => x.chainOut.gain.value = value);
  }

  get decay() { return tone.Time(this.taps[0].reverb.decay).toSeconds(); }
  set decay(value: number) {
    this.taps.forEach(x => x.reverb.decay = value);
  }

  get preDelay() { return tone.Time(this.taps[0].reverb.preDelay).toSeconds(); }
  set preDelay(value: number) {
    this.taps.forEach(x => x.reverb.preDelay = value);
  }

  get wet() { return this.wetOut.gain.value; }
  set wet(value: number) {
    value = clamp(value);

    this.wetOut.gain.value = value;
    this.dryOut.gain.value = 1.0 - value;
  }

  constructor() {
    this.order = 8;
    assert(this.taps.length == 8, `tap array not updated when order set to 8 (taps is ${this.taps.length})`);
  
    this.input.connect(this.dryOut);

    this.masterReverb.connect(this.wetOut);
    this.wetOut.connect(this.output);
    this.dryOut.connect(this.output);
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.output);
  }

  disconnect() {
    this.output.disconnect();
  }

  dispose() {
    this.disconnect();

    for (const tap of this.taps) {
      tap.dispose();
    }

    this.input.dispose();
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
  };
}

export type ShimmerNode = flow.Node<ShimmerNodeData, "shimmer">

/** Creates a new `ShimmerNode` with a random ID. */
export const createShimmerNode = makeNodeFactory("shimmer", () => new ShimmerNodeData());

/** Provides a `NodeTypeDescriptor` which describes shimmer nodes. */
export const SHIMMER_NODE_DESCRIPTOR = {
  displayName: "shimmer",
  icon: cls => <RiSparklingFill className={cls} />,
  create: createShimmerNode
} satisfies NodeTypeDescriptor;

export const ShimmerNodeRenderer = memo(function ShimmerNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ShimmerNodeData>>
) {
  const fx = data.effect;

  const [order, setOrder] = useBoundState(fx, "order");
  const [shift, setShift] = useBoundState(fx, "shift");
  const [intensity, setIntensity] = useState(fx.intensity * 100);
  const [decay, setDecay] = useState(fx.decay);
  const [preDelay, setPreDelay] = useState(fx.preDelay);
  const [wet, setWet] = useState(fx.wet * 100);

  useEffect(() => {
    if (!data.parameters["param-intensity"].isAutomated()) {
      fx.intensity = intensity / 100;
    }
  }, [data, fx, intensity]);

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
      name="shimmer"
      help={<>
        The <b>shimmer</b> module is a type of reverb, which provides a complex, shimmery reverb,
        by simulating a feedback loop that pitches the signal up a set amount of semitones, with
        the signal losing its gain each time it goes through the loop (controlled by the <b>intensity</b>)
        parameter.

        <br/><br/>

        This kind of effect is also called the <b>Eno/Lanois shimmer reverb</b>, as it was first popularized
        by Brian Eno and Daniel Lanois in their ambient works. It works best for acoustic instruments and
        synthesizer pads, and creates great ambiances.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to add the shimmer reverb to" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the audio, with the shimmer reverb"
            />
          </NodePort>

          <NumberField
            name="order"
            description="the amount of loops/taps to make the signal go through, emulating a feedback loop"
            value={order} onChange={setOrder}
          />

          <SliderField
            name="shift"
            description="the amount of semitones to pitch the signal up. +7 and +12 work best!"
            min={0} max={12} value={shift} onChange={setShift}
          />

          <NodePort nodeId={id} handleId={paramHandleId("intensity")} kind="input" type="value">
            <SliderField
              name="intensity"
              description="how much of the signal to carry through to next shimmer taps"
              min={0} max={90} value={intensity} isPercentage
              onChange={setIntensity}
              automatable={data.parameters["param-intensity"]}
              automatableDisplay={() => fx.intensity}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("decay")} kind="input" type="value">
            <SliderField
              name="decay"
              description="how fast the reverb trail fades out"
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
              description="amount of delay before the reverb"
              min={MIN_PREDELAY} max={MAX_PREDELAY} value={preDelay} step={1 / 1000}
              onChange={setPreDelay}
              automatable={data.parameters["param-predelay"]}
              automatableDisplay={() => fx.preDelay}
              valueStringifier={x => `${(x * 1000).toFixed(0)} ms`}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("wet")} kind="input" type="value">
            <SliderField
              name="wetness (mix)"
              description="the percentage of the resulting audio that is the reverb"
              min={0} max={100} value={wet} isPercentage
              onChange={setWet}
              automatable={data.parameters["param-wet"]}
              automatableDisplay={() => fx.wet * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
