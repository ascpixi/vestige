import * as flow from "@xyflow/react";
import * as tone from "tone";
import { memo, useEffect, useState } from "react";
import { RiAliensFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { Automatable, AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { assert, lerp } from "../../util";
import { FlatNodeDataSerializer, FlatSerializerSpec } from "../../serializer";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";

const MIN_BASE_FREQ = 40;
const MAX_BASE_FREQ = 10000;

const MIN_RATE = 0.05;
const MAX_RATE = 6;

export class PhaserNodeData extends EffectNodeData {
  effect: PhaserAudioEffect;
  parameters: {
    "param-base-freq": Automatable,
    "param-rate": Automatable,
    "param-wet": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new PhaserAudioEffect();

    const phaser = this.effect.phaser;
    this.parameters = {
      "param-base-freq": new Automatable(x => phaser.baseFrequency = lerp(MIN_BASE_FREQ, MAX_BASE_FREQ, x)),
      "param-rate": new Automatable(x => phaser.frequency.value = lerp(MIN_RATE, MAX_RATE, x)),
      "param-wet": new Automatable(x => phaser.wet.value = x)
    };
  }
};

export class PhaserAudioEffect implements AudioEffect {
  phaser = new tone.Phaser({
    baseFrequency: 400,
    frequency: 0.6,
    octaves: 2,
    stages: 10,
    wet: 1 
  });

  connectTo(dst: AudioDestination): void {
    dst.accept(this.phaser);
  }

  disconnect() {
    this.phaser.disconnect();
  }

  dispose() {
    this.disconnect();
    this.phaser.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.phaser);
  }
}

export class PhaserNodeSerializer extends FlatNodeDataSerializer<PhaserNodeData> {
  type = "phaser";
  dataFactory = () => new PhaserNodeData();

  spec: FlatSerializerSpec<PhaserNodeData> = {
    pf: this.prop(self => self.parameters["param-base-freq"]).with("controlledBy"),
    pr: this.prop(self => self.parameters["param-rate"]).with("controlledBy"),
    pw: this.prop(self => self.parameters["param-wet"]).with("controlledBy"),
    f: this.prop(self => self.effect.phaser).with("baseFrequency"),
    r: this.prop(self => self.effect.phaser.frequency).with("value"),
    w: this.prop(self => self.effect.phaser.wet).with("value"),
    o: this.prop(self => self.effect.phaser).with("octaves"),
    s: {
      get: (self) => self.effect.phaser.get().stages,
      set: (self, x) => self.effect.phaser.set({ stages: x })
    }
  }
}

export type PhaserNode = flow.Node<PhaserNodeData, "phaser">

/** Creates a new `PhaserNode` with a random ID. */
export const createPhaserNode = makeNodeFactory("phaser", () => new PhaserNodeData());

/** Provides a `NodeTypeDescriptor` which describes phaser nodes. */
export const PHASER_NODE_DESCRIPTOR = {
  displayName: "phaser",
  icon: cls => <RiAliensFill className={cls}/>,
  create: createPhaserNode
} satisfies NodeTypeDescriptor;

export const PhaserNodeRenderer = memo(function PhaserNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<PhaserNodeData>>
) {
  const phaser = data.effect.phaser;

  const [baseFreq, setBaseFreq] = useState(tone.Frequency(phaser.baseFrequency).toFrequency());
  const [rate, setRate] = useState(tone.Frequency(phaser.frequency.value).toFrequency());
  const [octaves, setOctaves] = useState(phaser.octaves);
  const [stages, setStages] = useState(phaser.get().stages);
  const [wet, setWet] = useState(phaser.wet.value * 100);

  useEffect(() => {
    if (!data.parameters["param-base-freq"].isAutomated()) {
      phaser.baseFrequency = baseFreq;
    }
  }, [data, baseFreq, phaser]);

  useEffect(() => {
    if (!data.parameters["param-rate"].isAutomated()) {
      phaser.frequency.value = rate;
    }
  }, [data, rate, phaser]);

  useEffect(() => { phaser.octaves = octaves }, [data, octaves, phaser]);
  useEffect(() => { phaser.set({ stages }) }, [data, stages, phaser]);

  useEffect(() => {
    if (!data.parameters["param-wet"].isAutomated()) {
      phaser.wet.value = wet / 100;
    }
  }, [data, wet, phaser]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="phaser"
      help={<>
        The <b>phaser</b> module creates a "synthesized", electronic, or "washy" effect
        by changing the phase of different frequency components of an incoming signal.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to modify" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the audio, with the phaser"
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("base-freq")} kind="input" type="value">
            <SliderField
              name="frequency"
              description="the base frequency of the phaser"
              min={MIN_BASE_FREQ} max={MAX_BASE_FREQ} value={baseFreq}
              onChange={setBaseFreq}
              automatable={data.parameters["param-base-freq"]}
              automatableDisplay={() => tone.Frequency(phaser.baseFrequency).toFrequency()}
              valueStringifier={x => `${x.toFixed(2)} Hz`}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("rate")} kind="input" type="value">
            <SliderField
              name="rate"
              description="rate of modulation of the cutoff"
              min={MIN_RATE} max={MAX_RATE} value={rate} step={0.01}
              onChange={setRate}
              automatable={data.parameters["param-rate"]}
              automatableDisplay={() => tone.Frequency(phaser.frequency.value).toFrequency()}
              valueStringifier={x => `${x.toFixed(2)} Hz`}
            />
          </NodePort>

          <SliderField
            name="octaves"
            description="the depth of the modulation of the cutoff, in octaves"
            min={1} max={5} value={octaves}
            onChange={setOctaves}
          />

          <SliderField
            name="stages"
            description="the amount of filters to use"
            min={1} max={15} value={stages}
            onChange={setStages}
          />

          <NodePort nodeId={id} handleId={paramHandleId("wet")} kind="input" type="value">
            <SliderField
              name="wetness (mix)"
              description="the percentage of the resulting audio that is the phaser"
              min={0} max={100} value={wet} isPercentage
              onChange={setWet}
              automatable={data.parameters["param-wet"]}
              automatableDisplay={() => phaser.wet.value * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
