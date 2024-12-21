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
import { RiEqualizer2Fill } from "@remixicon/react";
import { NodeDataSerializer } from "../serializer";

export class BalanceNodeData extends EffectNodeData {
  effect: BalanceAudioEffect;
  parameters: {
    "param-pan": Automatable,
    "param-volume": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new BalanceAudioEffect();

    const panvol = this.effect.panVol;
    this.parameters = {
      "param-pan": new Automatable(x => panvol.pan.value = lerp(-1, 1, x)),
      "param-volume": new Automatable(x => panvol.volume.value = tone.gainToDb(lerp(0, 2, x)))
    };
  }
};

export class BalanceAudioEffect implements AudioEffect {
  panVol = new tone.PanVol(0, 0);

  constructor() {
    this.panVol.channelCount = 2; // by default, this is 1 (mono), for some reason
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.panVol);
  }

  disconnect() {
    this.panVol.disconnect();
  }

  dispose() {
    this.disconnect();
    this.panVol.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.panVol);
  }
}

export class BalanceNodeSerializer implements NodeDataSerializer<BalanceNodeData> {
  type = "balance"

  serialize(obj: BalanceNodeData) {
    return {
      pp: obj.parameters["param-pan"].controlledBy,
      pv: obj.parameters["param-volume"].controlledBy,
      p: obj.effect.panVol.pan.value,
      v: obj.effect.panVol.volume.value
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): BalanceNodeData {
    const data = new BalanceNodeData();
    data.parameters["param-pan"].controlledBy = serialized.pp;
    data.parameters["param-volume"].controlledBy = serialized.pv;
    data.effect.panVol.pan.value = serialized.p;
    data.effect.panVol.volume.value = serialized.v;
    return data;
  }
}

export type BalanceNode = Node<BalanceNodeData, "balance">

/** Creates a new `BalanceNode` with a random ID. */
export const createBalanceNode = makeNodeFactory("balance", () => new BalanceNodeData());

/** Provides a `NodeTypeDescriptor` which describes balance nodes. */
export const BALANCE_NODE_DESCRIPTOR = {
  displayName: "balance (pan/volume)",
  icon: cls => <RiEqualizer2Fill className={cls}/>,
  create: createBalanceNode
} satisfies NodeTypeDescriptor;

export const BalanceNodeRenderer = memo(function BalanceNodeRenderer(
  { id, data }: NodeProps<Node<BalanceNodeData>>
) {
  const [pan, setPan] = useState(data.effect.panVol.pan.value * 100);
  const [volume, setVolume] = useState(tone.dbToGain(data.effect.panVol.volume.value) * 100);

  useEffect(() => {
    if (!data.parameters["param-pan"].isAutomated()) {
      data.effect.panVol.pan.value = pan / 100;
    }
  }, [data, pan]);

  useEffect(() => {
    if (!data.parameters["param-volume"].isAutomated()) {
      data.effect.panVol.volume.value = tone.gainToDb(volume / 100);
    }
  }, [data, volume]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="balance (pan/volume)"
      help={<>
        The <b>balance (pan/volume)</b> module changes either the volume (loudness) or
        the balance between the left and right speaker output. For example, a pan
        value of -100% will make the sound come out only from the left speaker, and
        a value of 100% will make it come out only from the right one. A value of 0%
        means balance - the input signal won't be affected in any way.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort offset={20} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to adjust" />
          </NodePort>

          <NodePort offset={80} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the adjusted audio"
            />
          </NodePort>

          <NodePort offset={140} handleId={paramHandleId("pan")} kind="input" type="value">
            <SliderField
              name="pan balance"
              description="-100% = left, 0% = no change, and 100% = right."
              min={-100} max={100} value={pan} isPercentage
              onChange={setPan}
              automatable={data.parameters["param-pan"]}
              automatableDisplay={() => data.effect.panVol.pan.value * 100}
            />
          </NodePort>

          <NodePort offset={220} handleId={paramHandleId("volume")} kind="input" type="value">
            <SliderField
              name="volume"
              description="how much of the original volume the signal should have"
              min={0} max={200} value={volume} isPercentage
              onChange={setVolume}
              automatable={data.parameters["param-volume"]}
              automatableDisplay={() => tone.dbToGain(data.effect.panVol.volume.value) * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
