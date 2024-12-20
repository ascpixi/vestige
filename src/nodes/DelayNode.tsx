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
import { RiRepeatLine } from "@remixicon/react";
import { NodeDataSerializer } from "../serializer";

const MIN_DELAY_TIME = 1 / 1000;
const MAX_DELAY_TIME = 1000 / 1000;

const MIN_FEEDBACK = 0;
const MAX_FEEDBACK = 0.9;

const scalarToDelayTime = (x: number) => lerp(MIN_DELAY_TIME, MAX_DELAY_TIME, x);
const scalarToFeedback = (x: number) => lerp(MIN_FEEDBACK, MAX_FEEDBACK, x);

export class DelayNodeData extends EffectNodeData {
  effect: DelayAudioEffect;
  parameters: {
    "param-time": Automatable,
    "param-feedback": Automatable,
    "param-wet": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new DelayAudioEffect();

    const delay = this.effect.delay;
    this.parameters = {
      "param-time": new Automatable(x => delay.delayTime.value = scalarToDelayTime(x)),
      "param-feedback": new Automatable(x => delay.feedback.value = scalarToFeedback(x)),
      "param-wet": new Automatable(x => delay.wet.value = x)
    };
  }
};

export class DelayAudioEffect implements AudioEffect {
  delay: tone.FeedbackDelay;

  connectTo(dst: AudioDestination): void {
    dst.accept(this.delay);
  }

  disconnect() {
    this.delay.disconnect();
  }

  dispose() {
    this.disconnect();
    this.delay.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.delay);
  }

  constructor() {
    this.delay = new tone.FeedbackDelay({
        delayTime: 0.4,
        feedback: 0.35,
        wet: 0.5
    });
  }
}

export class DelayNodeSerializer implements NodeDataSerializer<DelayNodeData> {
  type = "delay"

  serialize(obj: DelayNodeData) {
    const params = obj.parameters;
    const delay = obj.effect.delay;

    return {
      pt: params["param-time"].controlledBy,
      pf: params["param-feedback"].controlledBy,
      pw: params["param-wet"].controlledBy,
      t: delay.delayTime.value,
      f: delay.feedback.value,
      w: delay.wet.value
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): DelayNodeData {
    const data = new DelayNodeData();
    const params = data.parameters;
    const delay = data.effect.delay;

    params["param-time"].controlledBy = serialized.pt;
    params["param-feedback"].controlledBy = serialized.pf;
    params["param-wet"].controlledBy = serialized.pw;
    delay.delayTime.value = serialized.t;
    delay.feedback.value = serialized.f;
    delay.wet.value = serialized.w;

    return data;
  }
}

export type DelayNode = Node<DelayNodeData, "delay">

/** Creates a new `DelayNode` with a random ID. */
export const createDelayNode = makeNodeFactory("delay", () => new DelayNodeData());

/** Provides a `NodeTypeDescriptor` which describes delay nodes. */
export const DELAY_NODE_DESCRIPTOR = {
  displayName: "delay (echo)",
  icon: cls => <RiRepeatLine className={cls}/>,
  create: createDelayNode
} satisfies NodeTypeDescriptor;

export const DelayNodeRenderer = memo(function DelayNodeRenderer(
  { id, data }: NodeProps<Node<DelayNodeData>>
) {
  const [time, setTime] = useState(tone.Time(data.effect.delay.delayTime.value).toSeconds());
  const [feedback, setFeedback] = useState(data.effect.delay.feedback.value * 100);
  const [wet, setWet] = useState(data.effect.delay.wet.value * 100);

  useEffect(() => {
    if (!data.parameters["param-time"].isAutomated()) {
      data.effect.delay.delayTime.value = time;
    }
  }, [data, time]);

  useEffect(() => {
    if (!data.parameters["param-feedback"].isAutomated()) {
      data.effect.delay.feedback.value = feedback / 100;
    }
  }, [data, feedback]);

  useEffect(() => {
    if (!data.parameters["param-wet"].isAutomated()) {
      data.effect.delay.wet.value = wet / 100;
    }
  }, [data, wet]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="delay (echo)"
      help={<>
        A <b>delay</b> (or, more precisely, a <i>feedback delay</i>) emulates
        an echo, continously repeating the signal it's given. Extremely small
        <b> delay time</b> values produce interesting effects! Be careful with
        the <b>feedback</b> - too much, and you might just hurt your ears.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort offset={20} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to add the reverb to" />
          </NodePort>

          <NodePort offset={80} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the audio, with the reverb"
            />
          </NodePort>

          <NodePort offset={140} handleId={paramHandleId("time")} kind="input" type="value">
            <SliderField
              name="delay time"
              description="amount of time between repeats (echoes)"
              min={MIN_DELAY_TIME} max={MAX_DELAY_TIME} value={time} step={1 / 10000}
              valueStringifier={x => `${(x * 1000).toFixed(2)} ms`}
              onChange={setTime}
              automatable={data.parameters["param-time"]}
              automatableDisplay={() => tone.Time(data.effect.delay.delayTime.value).toSeconds()}
            />
          </NodePort>

          <NodePort offset={220} handleId={paramHandleId("feedback")} kind="input" type="value">
            <SliderField
              name="feedback"
              description="how much signal strength consecutive echoes have. larger values = longer echoes."
              min={MIN_FEEDBACK * 100} max={MAX_FEEDBACK * 100} value={feedback} isPercentage
              onChange={setFeedback}
              automatable={data.parameters["param-feedback"]}
              automatableDisplay={() => data.effect.delay.feedback.value * 100}
            />
          </NodePort>

          <NodePort offset={300} handleId={paramHandleId("wet")} kind="input" type="value">
            <SliderField
              name="wetness (mix)"
              description="the percentage of the resulting audio that is the delay (echo)"
              min={0} max={100} value={wet} isPercentage
              onChange={setWet}
              automatable={data.parameters["param-wet"]}
              automatableDisplay={() => data.effect.delay.wet.value * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
