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
  effect: MixAudioEffect;

  constructor() {
    super();
    this.effect = new MixAudioEffect();
  }
};

export class MixAudioEffect implements AudioEffect {
  gain: tone.Gain;
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

  constructor() {
    this.gain = new tone.Gain();
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
  displayName: "mix (combine)",
  icon: cls => <RiGitMergeFill className={cls}/>,
  create: createMixNode
} satisfies NodeTypeDescriptor;

export const MixNodeRenderer = memo(function MixNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<MixNodeData>>
) {
  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="mix (combine)"
      help={<>
        The <b>mix (combine)</b> module combines (or, mathematically speaking, adds)
        two different audio signals together.
      </>}
    >
      <div className="w-full">
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={INPUT_A} kind="input" type="signal">
            <PlainField name="input A" description="the first audio signal" />
          </NodePort>

          <NodePort nodeId={id} handleId={INPUT_B} kind="input" type="signal">
            <PlainField name="input B" description="the second audio signal" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="input A and B combined into one signal"
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
