import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useState } from "react";

import { makeNodeFactory } from "./basis";
import { NodeData, SIGNAL_INPUT_HID_MAIN, unaryAudioDestination } from "../graph";
import { NullNodeDataSerializer } from "../serializer";
import { getPersistentData, mutatePersistentData } from "../persistent";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

export class FinalNodeData extends NodeData {
  nodeType = "FINAL" as const;
  limiter = new tone.Limiter(tone.gainToDb(0.8));
  final = new tone.Gain(getPersistentData().volume);

  /**
   * Gets the audio node to which other nodes can connect to direct
   * their input to the final output device.
   */
  getInputDestination() {
    return unaryAudioDestination(this.limiter);
  }

  constructor() {
    super();
    this.limiter.connect(this.final);
    this.final.connect(tone.getDestination());
  }
}

export type FinalNode = flow.Node<FinalNodeData, "final">

const makeFinalNode = makeNodeFactory("final", () => new FinalNodeData());

/** Creates a new `FinalNode` with a random ID. The node cannot be deleted by the user. */
export const createFinalNode = (x: number, y: number): FinalNode => ({
  ...makeFinalNode(x, y),
  deletable: false
});

export class FinalNodeSerializer extends NullNodeDataSerializer<FinalNodeData> {
  type = "final"
  make() { return new FinalNodeData() }
}

export const FinalNodeRenderer = memo(function FinalNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<FinalNodeData>>
) {
  const [finalVolumeDisp, setFinalVolumeDisp] = useState(data.final.gain.value * 100);

  function setFinalVolume(x: number) {
    setFinalVolumeDisp(x);
    data.final.gain.value = x / 100;
    mutatePersistentData({ volume: x / 100 });
  }

  return (
    <VestigeNodeBase
      id={id}
      name="Output"
      help={<>
        The <b>output</b> node will output any audio you provide it to your speakers.
        The <b>volume</b> does not affect renders.
      </>}
    >
      <div className="flex flex-col gap-6">
        <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
          <PlainField name="input" />
        </NodePort>

        <SliderField
          name="volume"
          min={1} max={100} value={finalVolumeDisp} step={1} isPercentage
          onChange={setFinalVolume}
        />
      </div>
    </VestigeNodeBase>
  );
});
