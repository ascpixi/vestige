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
import { RiExpandLeftRightFill } from "@remixicon/react";
import { NodeDataSerializer } from "../serializer";

export class PanNodeData extends EffectNodeData {
  effect: PanAudioEffect;
  parameters: {
    "param-pan": Automatable,
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new PanAudioEffect();

    const delay = this.effect.panner;
    this.parameters = {
      "param-pan": new Automatable(x => delay.pan.value = lerp(-1, 1, x))
    };
  }
};

export class PanAudioEffect implements AudioEffect {
  panner = new tone.Panner(0);

  connectTo(dst: AudioDestination): void {
    dst.accept(this.panner);
  }

  disconnect() {
    this.panner.disconnect();
  }

  dispose() {
    this.disconnect();
    this.panner.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.panner);
  }
}

export class PanNodeSerializer implements NodeDataSerializer<PanNodeData> {
  type = "pan"

  serialize(obj: PanNodeData) {
    return {
      pp: obj.parameters["param-pan"].controlledBy,
      p: obj.effect.panner.pan.value
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): PanNodeData {
    const data = new PanNodeData();
    data.parameters["param-pan"].controlledBy = serialized.pp;
    data.effect.panner.pan.value = serialized.p;
    return data;
  }
}

export type PanNode = Node<PanNodeData, "pan">

/** Creates a new `PanNode` with a random ID. */
export const createPanNode = makeNodeFactory("pan", () => new PanNodeData());

/** Provides a `NodeTypeDescriptor` which describes pan nodes. */
export const PAN_NODE_DESCRIPTOR = {
  displayName: "pan (left/right)",
  icon: cls => <RiExpandLeftRightFill className={cls}/>,
  create: createPanNode
} satisfies NodeTypeDescriptor;

export const PanNodeRenderer = memo(function PanNodeRenderer(
  { id, data }: NodeProps<Node<PanNodeData>>
) {
  const [pan, setPan] = useState(data.effect.panner.pan.value * 100);

  useEffect(() => {
    if (!data.parameters["param-pan"].isAutomated()) {
      data.effect.panner.pan.value = pan / 100;
    }
  }, [data, pan]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="pan (left/right)"
      help={<>
        The <b>pan (left/right)</b> module changes the balance between the left
        and right speaker output. For example, a pan value of -100% will make
        the sound come out only from the left speaker, and a value of 100% will
        make it come out only from the right one. A value of 0% means balance -
        the input signal won't be affected in any way.
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

          <NodePort offset={140} handleId={paramHandleId("pan")} kind="input" type="value">
            <SliderField
              name="pan balance"
              description="-100% = left, 0% = no change, and 100% = right."
              min={-100} max={100} value={pan} isPercentage
              onChange={setPan}
              automatable={data.parameters["param-pan"]}
              automatableDisplay={() => data.effect.panner.pan.value * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
