import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiRepeatLine } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { Automatable } from "../../parameters";
import { assert, lerp } from "../../util";
import { FlatNodeDataSerializer } from "../../serializer";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { CheckboxField } from "../../components/CheckboxField";

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
  in: tone.Gain = new tone.Gain();
  delay: tone.FeedbackDelay | tone.PingPongDelay;
  out: tone.Gain = new tone.Gain();
  private _isPingPong = false;

  get isPingPong() { return this._isPingPong; }
  set isPingPong(value: boolean) {
    if (this._isPingPong == value)
      return; // no change

    const options = {
      delayTime: this.delay.delayTime.value,
      feedback: this.delay.feedback.value,
      wet: this.delay.wet.value
    };

    this.in.disconnect();
    this.delay.disconnect();
    this.delay.dispose();

    this.delay = value
      ? new tone.PingPongDelay(options)
      : new tone.FeedbackDelay(options);

    this.in.connect(this.delay);
    this.delay.connect(this.out);
    this._isPingPong = value;
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.out);
  }

  disconnect() {
    this.out.disconnect();
  }

  dispose() {
    this.in.disconnect();
    this.delay.disconnect();
    this.out.disconnect();

    this.in.dispose();
    this.delay.dispose();
    this.out.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.in);
  }

  constructor() {
    this.delay = new tone.FeedbackDelay({
      delayTime: 0.4,
      feedback: 0.35,
      wet: 0.5
    });

    this.in.connect(this.delay);
    this.delay.connect(this.out);
  }
}

export class DelayNodeSerializer extends FlatNodeDataSerializer<DelayNodeData> {
  type = "delay";
  dataFactory = () => new DelayNodeData();

  spec = {
    pt: this.prop(self => self.parameters["param-time"]).with("controlledBy"),
    pf: this.prop(self => self.parameters["param-feedback"]).with("controlledBy"),
    pw: this.prop(self => self.parameters["param-wet"]).with("controlledBy"),
    t: this.prop(self => self.effect.delay.delayTime).with("value"),
    f: this.prop(self => self.effect.delay.feedback).with("value"),
    w: this.prop(self => self.effect.delay.wet).with("value"),
    p: this.prop(self => self.effect).with("isPingPong", false) // since Vestige 0.3.0
  }
}

export type DelayNode = flow.Node<DelayNodeData, "delay">;

/** Creates a new `DelayNode` with a random ID. */
export const createDelayNode = makeNodeFactory("delay", () => new DelayNodeData());

/** Provides a `NodeTypeDescriptor` which describes delay nodes. */
export const DELAY_NODE_DESCRIPTOR = {
  displayName: "delay (echo)",
  icon: cls => <RiRepeatLine className={cls}/>,
  create: createDelayNode
} satisfies NodeTypeDescriptor;

export const DelayNodeRenderer = memo(function DelayNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<DelayNodeData>>
) {
  const delay = data.effect.delay;

  const [time, setTime] = useState(tone.Time(delay.delayTime.value).toSeconds());
  const [feedback, setFeedback] = useState(delay.feedback.value * 100);
  const [wet, setWet] = useState(delay.wet.value * 100);
  const [isPingPong, setIsPingPong] = useState(data.effect.isPingPong);

  useEffect(() => {
    if (!data.parameters["param-time"].isAutomated()) {
      delay.delayTime.value = time;
    }
  }, [data, delay, time]);

  useEffect(() => {
    if (!data.parameters["param-feedback"].isAutomated()) {
      delay.feedback.value = feedback / 100;
    }
  }, [data, delay, feedback]);

  useEffect(() => {
    if (!data.parameters["param-wet"].isAutomated()) {
      delay.wet.value = wet / 100;
    }
  }, [data, delay, wet]);

  useEffect(() => {
    data.effect.isPingPong = isPingPong;
  }, [data, isPingPong])

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
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to add the reverb to" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the audio, with the reverb"
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("time")} kind="input" type="value">
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

          <NodePort nodeId={id} handleId={paramHandleId("feedback")} kind="input" type="value">
            <SliderField
              name="feedback"
              description="how much signal strength consecutive echoes have. larger values = longer echoes."
              min={MIN_FEEDBACK * 100} max={MAX_FEEDBACK * 100} value={feedback} isPercentage
              onChange={setFeedback}
              automatable={data.parameters["param-feedback"]}
              automatableDisplay={() => data.effect.delay.feedback.value * 100}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("wet")} kind="input" type="value">
            <SliderField
              name="wetness (mix)"
              description="the percentage of the resulting audio that is the delay (echo)"
              min={0} max={100} value={wet} isPercentage
              onChange={setWet}
              automatable={data.parameters["param-wet"]}
              automatableDisplay={() => data.effect.delay.wet.value * 100}
            />
          </NodePort>

          <CheckboxField
            name="ping-pong (stereo)"
            description="the delay will first be heard in one speaker, then the opposite, and so on..."
            value={isPingPong}
            onChange={setIsPingPong}
          />
        </div>
      </div>
    </VestigeNodeBase>
  );
});
