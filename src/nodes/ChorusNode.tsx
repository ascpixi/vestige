import * as flow from "@xyflow/react";
import * as tone from "tone";
import { memo, useEffect, useState } from "react";
import { RiUserCommunityFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../graph";
import { Automatable } from "../parameters";
import { assert, lerp } from "../util";
import { FlatNodeDataSerializer } from "../serializer";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

const MIN_FREQ = 0.01;
const MAX_FREQ = 5;

const MIN_FEEDBACK = 0;
const MAX_FEEDBACK = 0.9;

export class ChorusNodeData extends EffectNodeData {
  effect: ChorusAudioEffect;
  parameters: {
    "param-feedback": Automatable,
    "param-frequency": Automatable,
    "param-depth": Automatable,
    "param-spread": Automatable,
    "param-wet": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new ChorusAudioEffect();

    const chorus = this.effect.chorus;
    this.parameters = {
      "param-feedback": new Automatable(x => chorus.feedback.value = lerp(MIN_FEEDBACK, MAX_FEEDBACK, x)),
      "param-frequency": new Automatable(x => chorus.frequency.value = lerp(MIN_FREQ, MAX_FREQ, x)),
      "param-depth": new Automatable(x => chorus.depth = x),
      "param-spread": new Automatable(x => chorus.spread = lerp(0, 180, x)),
      "param-wet": new Automatable(x => chorus.wet.value = x)
    };
  }
};

export class ChorusAudioEffect implements AudioEffect {
  chorus = new tone.Chorus({
    frequency: 0.3,
    delayTime: 1.25,
    depth: 0.5,
    spread: 180,
    feedback: 0.7,
    wet: 0.4
  });

  constructor() {
    this.chorus.start();
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.chorus);
  }

  disconnect() {
    this.chorus.disconnect();
  }

  dispose() {
    this.disconnect();
    this.chorus.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.chorus);
  }
}

export class ChorusNodeSerializer extends FlatNodeDataSerializer<ChorusNodeData> {
  type = "chorus";
  dataFactory = () => new ChorusNodeData();

  spec = {
    pf: this.prop(self => self.parameters["param-feedback"]).with("controlledBy"),
    pq: this.prop(self => self.parameters["param-frequency"]).with("controlledBy"),
    pd: this.prop(self => self.parameters["param-depth"]).with("controlledBy"),
    ps: this.prop(self => self.parameters["param-spread"]).with("controlledBy"),
    pw: this.prop(self => self.parameters["param-wet"]).with("controlledBy"),
    f: this.prop(self => self.effect.chorus.feedback).with("value"),
    q: this.prop(self => self.effect.chorus.frequency).with("value"),
    d: this.prop(self => self.effect.chorus).with("depth"),
    s: this.prop(self => self.effect.chorus).with("spread"),
    w: this.prop(self => self.effect.chorus.wet).with("value")
  }
}

export type ChorusNode = flow.Node<ChorusNodeData, "chorus">

/** Creates a new `ChorusNode` with a random ID. */
export const createChorusNode = makeNodeFactory("chorus", () => new ChorusNodeData());

/** Provides a `NodeTypeDescriptor` which describes chorus nodes. */
export const CHORUS_NODE_DESCRIPTOR = {
  displayName: "chorus",
  icon: cls => <RiUserCommunityFill className={cls}/>,
  create: createChorusNode
} satisfies NodeTypeDescriptor;

export const ChorusNodeRenderer = memo(function ChorusNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ChorusNodeData>>
) {
  const chorus = data.effect.chorus;

  const [feedback, setFeedback] = useState(chorus.feedback.value * 100);
  const [frequency, setFrequency] = useState(tone.Frequency(chorus.frequency.value).toFrequency());
  const [depth, setDepth] = useState(chorus.depth * 100);
  const [spread, setSpread] = useState(chorus.spread);
  const [wet, setWet] = useState(chorus.wet.value * 100);

  useEffect(() => {
    if (!data.parameters["param-feedback"].isAutomated()) {
      chorus.feedback.value = feedback / 100;
    }
  }, [data, feedback, chorus]);

  useEffect(() => {
    if (!data.parameters["param-frequency"].isAutomated()) {
      chorus.frequency.value = frequency;
    }
  }, [data, frequency, chorus]);

  useEffect(() => {
    if (!data.parameters["param-depth"].isAutomated()) {
      chorus.depth = depth / 100;
    }
  }, [data, depth, chorus]);

  useEffect(() => {
    if (!data.parameters["param-spread"].isAutomated()) {
      chorus.spread = spread;
    }
  }, [data, spread, chorus]);

  useEffect(() => {
    if (!data.parameters["param-wet"].isAutomated()) {
      chorus.wet.value = wet / 100;
    }
  }, [data, wet, chorus]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="chorus"
      help={<>
        The <b>chorus</b> module simulates a "chorused" sound from a single signal.
        This is done by mixing the signal with delayed copies of itself, modulated
        by an internal LFO (Low Frequency Oscillator).
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to add chorus to" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the chorused audio"
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("feedback")} kind="input" type="value">
            <SliderField
              name="feedback"
              description="amount of the signal going back to the chorus. more values = more chorus"
              min={MIN_FEEDBACK * 100} max={MAX_FEEDBACK * 100} value={feedback} isPercentage
              onChange={setFeedback}
              automatable={data.parameters["param-feedback"]}
              automatableDisplay={() => chorus.feedback.value * 100}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("frequency")} kind="input" type="value">
            <SliderField
              name="rate (frequency)"
              description="the speed of pitch modulation"
              min={MIN_FREQ} max={MAX_FREQ} value={frequency} step={0.01}
              onChange={setFrequency}
              automatable={data.parameters["param-frequency"]}
              automatableDisplay={() => tone.Frequency(chorus.frequency.value).toFrequency()}
              valueStringifier={x => `${x.toFixed(2)} Hz`}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("depth")} kind="input" type="value">
            <SliderField
              name="depth"
              description="the frequency range of pitch modulation"
              min={0} max={100} value={depth} isPercentage
              onChange={setDepth}
              automatable={data.parameters["param-depth"]}
              automatableDisplay={() => chorus.depth * 100}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("spread")} kind="input" type="value">
            <SliderField
              name="stereo spread"
              description="also known as the width - a value of 180° = hard left/right pan"
              min={0} max={180} value={spread}
              onChange={setSpread}
              automatable={data.parameters["param-spread"]}
              automatableDisplay={() => chorus.spread}
              valueStringifier={x => `${x}°`}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("wet")} kind="input" type="value">
            <SliderField
              name="wetness (mix)"
              description="the percentage of the resulting audio that is the chorus"
              min={0} max={100} value={wet} isPercentage
              onChange={setWet}
              automatable={data.parameters["param-wet"]}
              automatableDisplay={() => chorus.wet.value * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
