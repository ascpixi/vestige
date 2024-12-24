import * as flow from "@xyflow/react";
import * as tone from "tone";
import { memo, useEffect, useState } from "react";
import { RiSchoolFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../graph";
import { Automatable } from "../parameters";
import { assert, lerp } from "../util";
import { FlatNodeDataSerializer, FlatSerializerSpec } from "../serializer";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

const MIN_DECAY = 0.1;
const MAX_DECAY = 10;

const MIN_PREDELAY = 0;
const MAX_PREDELAY = 0.5;

const scalarToDecay = (x: number) => lerp(MIN_DECAY, MAX_DECAY, x);
const scalarToPreDelay = (x: number) => lerp(MIN_PREDELAY, MAX_PREDELAY, x);

export class ReverbNodeData extends EffectNodeData {
  effect: ReverbAudioEffect;
  parameters: {
    "param-decay": Automatable,
    "param-predelay": Automatable,
    "param-wet": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new ReverbAudioEffect();

    const reverb = this.effect.reverb;
    this.parameters = {
      "param-decay": new Automatable(x => reverb.decay = scalarToDecay(x)),
      "param-predelay": new Automatable(x => reverb.preDelay = scalarToPreDelay(x)),
      "param-wet": new Automatable(x => reverb.wet.value = x)
    };
  }
};

export class ReverbAudioEffect implements AudioEffect {
  reverb: tone.Reverb = new tone.Reverb({
    decay: 4.00,
    preDelay: 20 / 1000,
    wet: 0.5
  });

  connectTo(dst: AudioDestination): void {
    dst.accept(this.reverb);
  }

  disconnect() {
    this.reverb.disconnect();
  }

  dispose() {
    this.disconnect();
    this.reverb.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.reverb);
  }
}

export class ReverbNodeSerializer extends FlatNodeDataSerializer<ReverbNodeData> {
  type = "reverb";
  dataFactory = () => new ReverbNodeData();

  spec: FlatSerializerSpec<ReverbNodeData> = {
    pd: this.prop(self => self.parameters["param-decay"]).with("controlledBy"),
    pp: this.prop(self => self.parameters["param-predelay"]).with("controlledBy"),
    pw: this.prop(self => self.parameters["param-wet"]).with("controlledBy"),
    w: this.prop(self => self.effect.reverb.wet).with("value"),
    d: {
      get: (self) => tone.Time(self.effect.reverb.decay).toSeconds(),
      set: (self, x) => self.effect.reverb.decay = x
    },
    p: {
      get: (self) => tone.Time(self.effect.reverb.preDelay).toSeconds(),
      set: (self, x) => self.effect.reverb.preDelay = x
    }
  };
}

export type ReverbNode = flow.Node<ReverbNodeData, "reverb">

/** Creates a new `ReverbNode` with a random ID. */
export const createReverbNode = makeNodeFactory("reverb", () => new ReverbNodeData());

/** Provides a `NodeTypeDescriptor` which describes reverb nodes. */
export const REVERB_NODE_DESCRIPTOR = {
  displayName: "reverb",
  icon: cls => <RiSchoolFill className={cls}/>,
  create: createReverbNode
} satisfies NodeTypeDescriptor;

export const ReverbNodeRenderer = memo(function ReverbNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ReverbNodeData>>
) {
  const [decay, setDecay] = useState(tone.Time(data.effect.reverb.decay).toSeconds());
  const [preDelay, setPreDelay] = useState(tone.Time(data.effect.reverb.preDelay).toSeconds());
  const [wet, setWet] = useState(data.effect.reverb.wet.value * 100);

  useEffect(() => {
    if (!data.parameters["param-decay"].isAutomated()) {
      data.effect.reverb.decay = decay;
    }
  }, [data, decay]);

  useEffect(() => {
    if (!data.parameters["param-predelay"].isAutomated()) {
      data.effect.reverb.preDelay = preDelay;
    }
  }, [data, preDelay]);

  useEffect(() => {
    if (!data.parameters["param-wet"].isAutomated()) {
      data.effect.reverb.wet.value = wet / 100;
    }
  }, [data, wet]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="reverb"
      help={<>
        The <b>reverb</b> module provides a sense of depth to the sound, making it
        sound like it's in an actual room. The <b>decay</b> parameter determines how
        long the "reverb trail" is - longer values mean the reverb takes longer to go away.

        <br/><br/>

        The <b>predelay</b> parameter is useful for sounds with short and snappy attacks.
        Higher values help with preserving those sharp transients. For more atmospheric
        sounds, try to keep this short.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to add the reverb to" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the audio, with the reverb"
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
              automatableDisplay={() => tone.Time(data.effect.reverb.decay).toSeconds()}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("predelay")} kind="input" type="value">
            <SliderField
              name="pre-delay"
              description="amount of delay before the reverb"
              min={MIN_PREDELAY} max={MAX_PREDELAY} value={preDelay} step={1 / 1000}
              onChange={setPreDelay}
              automatable={data.parameters["param-predelay"]}
              automatableDisplay={() => tone.Time(data.effect.reverb.preDelay).toSeconds()}
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
              automatableDisplay={() => data.effect.reverb.wet.value * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
