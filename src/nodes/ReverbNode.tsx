import { memo, useEffect, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import * as tone from "tone";

import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../graph";
import { SliderField } from "../components/SliderField";
import { Automatable } from "../parameters";
import { assert, lerp } from "../util";
import { makeNodeFactory, NodeTypeDescriptor } from ".";
import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { RiSchoolFill } from "@remixicon/react";
import { NodeDataSerializer } from "../serializer";

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
  reverb: tone.Reverb;

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

  constructor() {
    this.reverb = new tone.Reverb({
      decay: 4.00,
      preDelay: 20 / 1000,
      wet: 0.5
    });
  }
}

export class ReverbNodeSerializer implements NodeDataSerializer<ReverbNodeData> {
  type = "reverb"

  serialize(obj: ReverbNodeData) {
    const reverb = obj.effect.reverb;
    const params = obj.parameters;

    return {
      pd: params["param-decay"].controlledBy,
      pp: params["param-predelay"].controlledBy,
      pw: params["param-wet"].controlledBy,
      d: tone.Time(reverb.decay).toSeconds(),
      p: tone.Time(reverb.preDelay).toSeconds(),
      w: reverb.wet.value,
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): ReverbNodeData {
    const data = new ReverbNodeData();
    const reverb = data.effect.reverb;
    const params = data.parameters;

    params["param-decay"].controlledBy = serialized.pd;
    params["param-predelay"].controlledBy = serialized.pp;
    params["param-wet"].controlledBy = serialized.pw;
    reverb.decay = serialized.d;
    reverb.preDelay = serialized.p;
    reverb.wet.value = serialized.w;

    return data;
  }
}

export type ReverbNode = Node<ReverbNodeData, "reverb">

/** Creates a new `ReverbNode` with a random ID. */
export const createReverbNode = makeNodeFactory("reverb", () => new ReverbNodeData());

/** Provides a `NodeTypeDescriptor` which describes reverb nodes. */
export const REVERB_NODE_DESCRIPTOR = {
  displayName: "reverb",
  icon: cls => <RiSchoolFill className={cls}/>,
  create: createReverbNode
} satisfies NodeTypeDescriptor;

export const ReverbNodeRenderer = memo(function ReverbNodeRenderer(
  { id, data }: NodeProps<Node<ReverbNodeData>>
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
