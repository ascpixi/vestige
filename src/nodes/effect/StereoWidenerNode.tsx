import * as flow from "@xyflow/react";
import * as tone from "tone";
import { memo, useEffect, useState } from "react";
import { RiHeadphoneFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { Automatable } from "../../parameters";
import { assert } from "../../util";
import { FlatNodeDataSerializer, FlatSerializerSpec } from "../../serializer";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";

export class StereoWidenerNodeData extends EffectNodeData {
  effect: StereoWidenerAudioEffect;
  parameters: {
    "param-width": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new StereoWidenerAudioEffect();

    const widener = this.effect.widener;
    this.parameters = {
      "param-width": new Automatable(x => widener.width.value = x)
    };
  }
};

export class StereoWidenerAudioEffect implements AudioEffect {
  widener = new tone.StereoWidener(0.75);

  connectTo(dst: AudioDestination): void {
    dst.accept(this.widener);
  }

  disconnect() {
    this.widener.disconnect();
  }

  dispose() {
    this.disconnect();
    this.widener.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.widener);
  }
}

export class StereoWidenerNodeSerializer extends FlatNodeDataSerializer<StereoWidenerNodeData> {
  type = "stereo-widener";
  dataFactory = () => new StereoWidenerNodeData();

  spec: FlatSerializerSpec<StereoWidenerNodeData> = {
    pw: this.prop(self => self.parameters["param-width"]).with("controlledBy"),
    w: this.prop(self => self.effect.widener.width).with("value")
  };
}

export type StereoWidenerNode = flow.Node<StereoWidenerNodeData, "stereo-widener">

/** Creates a new `StereoWidenerNode` with a random ID. */
export const createStereoWidenerNode = makeNodeFactory("stereo-widener", () => new StereoWidenerNodeData());

/** Provides a `NodeTypeDescriptor` which describes stereo widener nodes. */
export const STEREO_WIDENER_NODE_DESCRIPTOR = {
  displayName: "stereo widener",
  icon: cls => <RiHeadphoneFill className={cls}/>,
  create: createStereoWidenerNode
} satisfies NodeTypeDescriptor;

export const StereoWidenerNodeRenderer = memo(function StereoWidenerNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<StereoWidenerNodeData>>
) {
  const [width, setWidth] = useState(data.effect.widener.width.value * 100);

  useEffect(() => {
    if (!data.parameters["param-width"].isAutomated()) {
        data.effect.widener.width.value = width / 100;
    }
  }, [data, width]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="stereo widener"
      help={<>
        The <b>stereo widener</b> module changes the stereo width of a sound, either making
        it mono, or more stereo. The higher the "width" parameter, the "wider" the sound is.
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
              description="the audio, modified"
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("width")} kind="input" type="value">
            <SliderField
              name="width"
              description="the width of the sound - 0% means mono, 100% means fully stereo"
              min={0} max={100} isPercentage
              value={width} onChange={setWidth}
              automatable={data.parameters["param-width"]}
              automatableDisplay={() => data.effect.widener.width.value * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
