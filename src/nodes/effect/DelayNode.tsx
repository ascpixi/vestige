import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiRepeatLine } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { Automatable, linearUnit } from "../../graph";
import { assert, lerp } from "../../util";
import { FlatNodeDataSerializer } from "../../serializer";
import { useTempoSync } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { CheckboxField } from "../../components/CheckboxField";
import { DivisionField, SyncToggle } from "../../components/TempoSync";
import { DEFAULT_BPM, divisionLength } from "../../transport";

const MIN_DELAY_TIME = 1 / 1000;
const MAX_DELAY_TIME = 1000 / 1000;

const MIN_FEEDBACK = 0;
const MAX_FEEDBACK = 0.9;

/** The longest delay time that tempo-synced delays can reach, in seconds. */
const MAX_SYNCED_DELAY_TIME = 4;

const scalarToDelayTime = (x: number) => lerp(MIN_DELAY_TIME, MAX_DELAY_TIME, x);
const scalarToFeedback = (x: number) => lerp(MIN_FEEDBACK, MAX_FEEDBACK, x);

const TIME_UNIT = linearUnit(
  MIN_DELAY_TIME * 1000,
  MAX_DELAY_TIME * 1000,
  x => `${x.toFixed(1)} ms`
);
const FEEDBACK_UNIT = linearUnit(
  MIN_FEEDBACK * 100,
  MAX_FEEDBACK * 100,
  x => `${Math.round(x)}%`
);

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

    // The delay is re-created when toggling ping-pong, so we always access it through the effect.
    const fx = this.effect;
    this.parameters = {
      "param-time": new Automatable(
        x => fx.delay.delayTime.value = scalarToDelayTime(x),
        TIME_UNIT
      ),
      "param-feedback": new Automatable(
        x => fx.delay.feedback.value = scalarToFeedback(x),
        FEEDBACK_UNIT
      ),
      "param-wet": new Automatable(x => fx.delay.wet.value = x)
    };
  }
};

export class DelayAudioEffect implements AudioEffect {
  in: tone.Gain = new tone.Gain();
  delay: tone.FeedbackDelay | tone.PingPongDelay;
  out: tone.Gain = new tone.Gain();
  private _isPingPong = false;
  private _sync = false;
  private _division = "1/8.";
  private _bpm = DEFAULT_BPM;

  /** If `true`, the delay time follows the tempo of the node. */
  get sync() { return this._sync; }
  set sync(value: boolean) {
    this._sync = value;
    this.applySync();
  }

  /** The note division the delay time is set to, when synced to the tempo. */
  get division() { return this._division; }
  set division(value: string) {
    this._division = value;
    this.applySync();
  }

  /** The tempo that `division` is relative to, in beats per minute. */
  get bpm() { return this._bpm; }
  set bpm(value: number) {
    this._bpm = value;
    this.applySync();
  }

  private applySync() {
    if (!this._sync)
      return;

    const syncedTime = divisionLength(this._division, this._bpm);
    this.delay.delayTime.value = Math.min(MAX_SYNCED_DELAY_TIME, syncedTime);
  }

  get isPingPong() { return this._isPingPong; }
  set isPingPong(value: boolean) {
    if (this._isPingPong == value)
      return; // no change

    const options = {
      maxDelay: MAX_SYNCED_DELAY_TIME,
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
      maxDelay: MAX_SYNCED_DELAY_TIME,
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
    p: this.prop(self => self.effect).with("isPingPong", false), // since Vestige 0.3.0
    y: this.prop(self => self.effect).with("sync", false), // since Vestige 0.6.0
    v: this.prop(self => self.effect).with("division", "1/8."), // since Vestige 0.6.0
    k: this.prop(self => self.effect).with("bpm", DEFAULT_BPM) // since Vestige 0.6.0
  }
}

export type DelayNode = flow.Node<DelayNodeData, "delay">;

/** Creates a new `DelayNode` with a random ID. */
export const createDelayNode = makeNodeFactory("delay", () => new DelayNodeData());

/** Provides a `NodeTypeDescriptor` which describes delay nodes. */
export const DELAY_NODE_DESCRIPTOR = {
  displayName: "Delay",
  icon: cls => <RiRepeatLine className={cls}/>,
  help: <>
    <p>
      The <b>delay</b> node emulates an echo, continuously repeating the signal it's given.
      Extremely small <b>time</b> values produce interesting effects! Be careful with
      the <b>feedback</b> - too much, and you might just hurt your ears.
    </p>

    <p>
      With <b>ping-pong</b> enabled, the repeats alternate between the left and right channels.
    </p>
  </>,
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
  const { sync, onSyncChange, division, setDivision, bpm, setBpm } = useTempoSync(
    data.effect,
    () => time
  );

  useEffect(() => {
    if (!data.parameters["param-time"].isAutomated() && !sync) {
      delay.delayTime.value = time;
    }
  }, [data, delay, time, sync]);

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
      name="Delay"
      help={DELAY_NODE_DESCRIPTOR.help}
    >
      <div>
        <div className="flex flex-col gap-6">
          <div className="flex justify-between gap-4">
            <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
              <PlainField name="input" />
            </NodePort>

            <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
              <PlainField align="right" name="output" />
            </NodePort>
          </div>

          <NodePort nodeId={id} handleId={paramHandleId("time")} kind="input" type="value">
            {
              sync ? (
                <DivisionField
                  name="time"
                  value={division} onChange={setDivision}
                  bpm={bpm} onBpmChange={setBpm}
                  onSyncedChange={onSyncChange}
                  maxBeats={4}
                />
              ) : (
                <SliderField
                  name="time"
                  min={MIN_DELAY_TIME} max={MAX_DELAY_TIME} value={time} step={1 / 10000}
                  valueStringifier={x => `${(x * 1000).toFixed(1)} ms`}
                  valueParser={x => x / 1000}
                  onChange={setTime}
                  automatable={data.parameters["param-time"]}
                  automatableDisplay={() => tone.Time(data.effect.delay.delayTime.value).toSeconds()}
                  headerAccessory={<SyncToggle synced={false} onChange={onSyncChange}/>}
                />
              )
            }
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("feedback")} kind="input" type="value">
            <SliderField
              name="feedback"
              min={MIN_FEEDBACK * 100} max={MAX_FEEDBACK * 100} value={feedback} isPercentage
              onChange={setFeedback}
              automatable={data.parameters["param-feedback"]}
              automatableDisplay={() => data.effect.delay.feedback.value * 100}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("wet")} kind="input" type="value">
            <SliderField
              name="mix"
              min={0} max={100} value={wet} isPercentage
              onChange={setWet}
              automatable={data.parameters["param-wet"]}
              automatableDisplay={() => data.effect.delay.wet.value * 100}
            />
          </NodePort>

          <CheckboxField
            name="ping-pong"
            value={isPingPong}
            onChange={setIsPingPong}
          />
        </div>
      </div>
    </VestigeNodeBase>
  );
});
