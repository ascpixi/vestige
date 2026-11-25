import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiGitMergeFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { AudioDestination, AudioEffect, EffectNodeData, SIGNAL_OUTPUT_HID, signalInHandleId, unaryAudioDestination } from "../graph";
import { NullNodeDataSerializer } from "../serializer";
import { assert } from "../util";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

const INPUT_A = signalInHandleId("a");
const INPUT_B = signalInHandleId("b");

export class MixNodeData extends EffectNodeData {
  effect = new MixAudioEffect();
};

export class MixAudioEffect implements AudioEffect {
  gain = new tone.Gain();
  inputA?: tone.ToneAudioNode;
  inputB?: tone.ToneAudioNode;

  connectTo(dst: AudioDestination): void {
    dst.accept(this.gain);
  }

  disconnect() {
    this.gain.disconnect();
  }

  dispose() {
    this.disconnect();
    this.gain.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == INPUT_A || handleId == INPUT_B, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.gain);
  }
}

export class MixNodeSerializer extends NullNodeDataSerializer<MixNodeData> {
  type = "mix"
  make() { return new MixNodeData() }
}

export type MixNode = flow.Node<MixNodeData, "mix">

/** Creates a new `MixNode` with a random ID. */
export const createMixNode = makeNodeFactory("mix", () => new MixNodeData());

/** Provides a `NodeTypeDescriptor` which describes mix nodes. */
export const MIX_NODE_DESCRIPTOR = {
  displayName: "Mix",
  icon: cls => <RiGitMergeFill className={cls}/>,
  help: <>
    The <b>mix</b> node combines (or, mathematically speaking, adds) two different audio
    signals together.
  </>,
  create: createMixNode
} satisfies NodeTypeDescriptor;

export const MixNodeRenderer = memo(function MixNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<MixNodeData>>
) {
  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="Mix"
      help={MIX_NODE_DESCRIPTOR.help}
      className="w-[200px]"
    >
      <div className="flex justify-between items-center gap-4 w-full">
        <div className="flex flex-col gap-4">
          <NodePort nodeId={id} handleId={INPUT_A} kind="input" type="signal">
            <PlainField name="A" />
          </NodePort>

          <NodePort nodeId={id} handleId={INPUT_B} kind="input" type="signal">
            <PlainField name="B" />
          </NodePort>
        </div>

        <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
          <PlainField align="right" name="A+B" />
        </NodePort>
      </div>
    </VestigeNodeBase>
  );
});
