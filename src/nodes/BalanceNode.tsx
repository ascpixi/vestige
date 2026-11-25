import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiEqualizer2Fill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../graph";
import { Automatable, GAIN_UNIT, ParameterUnit } from "../graph";
import { assert, lerp } from "../util";
import { formatGain } from "../audioUtil";
import { FlatNodeDataSerializer } from "../serializer";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

const PAN_UNIT: ParameterUnit = {
  format: x => {
    const pan = Math.round(lerp(-100, 100, x));
    return pan == 0 ? "C" : `${Math.abs(pan)}${pan < 0 ? "L" : "R"}`;
  },
  parse: x => (x + 100) / 200
};

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
      "param-pan": new Automatable(x => panvol.pan.value = lerp(-1, 1, x), PAN_UNIT),
      "param-volume": new Automatable(
        x => panvol.volume.value = tone.gainToDb(lerp(0, 2, x)),
        GAIN_UNIT
      )
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

export class BalanceNodeSerializer extends FlatNodeDataSerializer<BalanceNodeData> {
  type = "balance";
  dataFactory = () => new BalanceNodeData();

  spec = {
    pp: this.prop(self => self.parameters["param-pan"]).with("controlledBy"),
    pv: this.prop(self => self.parameters["param-volume"]).with("controlledBy"),
    p: this.prop(self => self.effect.panVol.pan).with("value"),
    v: this.prop(self => self.effect.panVol.volume).with("value")
  }
}

export type BalanceNode = flow.Node<BalanceNodeData, "balance">

/** Creates a new `BalanceNode` with a random ID. */
export const createBalanceNode = makeNodeFactory("balance", () => new BalanceNodeData());

/** Provides a `NodeTypeDescriptor` which describes balance nodes. */
export const BALANCE_NODE_DESCRIPTOR = {
  displayName: "Balance",
  icon: cls => <RiEqualizer2Fill className={cls}/>,
  help: <>
    <p>
      The <b>balance</b> node changes either the gain (loudness) of a signal, or the balance
      between its left and right channels.
    </p>

    <p>
      For example, when the pan is all the way to the left (<b>100L</b>), the sound will only come
      out of the left speaker. When it's in the center (<b>C</b>), the signal won't be affected.
    </p>
  </>,
  create: createBalanceNode
} satisfies NodeTypeDescriptor;

export const BalanceNodeRenderer = memo(function BalanceNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<BalanceNodeData>>
) {
  const panVol = data.effect.panVol;

  const [pan, setPan] = useState(panVol.pan.value * 100);
  const [volume, setVolume] = useState(tone.dbToGain(panVol.volume.value) * 100);

  useEffect(() => {
    if (!data.parameters["param-pan"].isAutomated()) {
       panVol.pan.value = pan / 100;
    }
  }, [data, panVol, pan]);

  useEffect(() => {
    if (!data.parameters["param-volume"].isAutomated()) {
      panVol.volume.value = tone.gainToDb(volume / 100);
    }
  }, [data, panVol, volume]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="Balance"
      help={BALANCE_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <div className="flex justify-between gap-4">
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="input" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right" name="output" />
          </NodePort>
        </div>

        <NodePort nodeId={id} handleId={paramHandleId("pan")} kind="input" type="value">
          <SliderField
            name="pan"
            min={-100} max={100} value={pan}
            valueStringifier={x => x == 0 ? "C" : `${Math.abs(Math.round(x))}${x < 0 ? "L" : "R"}`}
            valueParser={x => x}
            onChange={setPan}
            automatable={data.parameters["param-pan"]}
            automatableDisplay={() => panVol.pan.value * 100}
          />
        </NodePort>

        <NodePort nodeId={id} handleId={paramHandleId("volume")} kind="input" type="value">
          <SliderField
            name="gain"
            min={0} max={200} value={volume}
            valueStringifier={x => formatGain(x / 100)}
            valueParser={x => tone.dbToGain(x) * 100}
            onChange={setVolume}
            automatable={data.parameters["param-volume"]}
            automatableDisplay={() => tone.dbToGain(panVol.volume.value) * 100}
          />
        </NodePort>
      </div>
    </VestigeNodeBase>
  );
});
