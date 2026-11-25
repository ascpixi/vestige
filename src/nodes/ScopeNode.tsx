import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiPulseLine } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { AudioDestination, AudioEffect, EffectNodeData, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../graph";
import { formatMilliseconds } from "../audioUtil";
import { FlatNodeDataSerializer } from "../serializer";
import { assert, invLogLerp, logLerp } from "../util";
import { useBoundState } from "../hooks";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SelectField } from "../components/SelectField";
import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { AudioScope, clampTimeWindow, DEFAULT_TIME_WINDOW, MAX_TIME_WINDOW, MIN_TIME_WINDOW, ScopeMode } from "../components/viz/AudioScope";

export class ScopeNodeData extends EffectNodeData {
  effect = new ScopeAudioEffect();
  mode: ScopeMode = "WAVEFORM";

  /** The amount of time displayed by the oscilloscope, in seconds. */
  timeWindow: number = DEFAULT_TIME_WINDOW;
};

export class ScopeAudioEffect implements AudioEffect {
  gain = new tone.Gain();

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
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.gain);
  }
}

export class ScopeNodeSerializer extends FlatNodeDataSerializer<ScopeNodeData> {
  type = "scope";
  dataFactory = () => new ScopeNodeData();

  spec = {
    m: this.prop("mode"),
    t: this.prop("timeWindow", DEFAULT_TIME_WINDOW)
  }
}

export type ScopeNode = flow.Node<ScopeNodeData, "scope">

/** Creates a new `ScopeNode` with a random ID. */
export const createScopeNode = makeNodeFactory("scope", () => new ScopeNodeData());

/** Provides a `NodeTypeDescriptor` which describes scope nodes. */
export const SCOPE_NODE_DESCRIPTOR = {
  displayName: "Scope",
  icon: cls => <RiPulseLine className={cls}/>,
  help: <>
    <p>
      The <b>scope</b> node lets you see the signal that passes through it as an oscilloscope,
      a spectrum, or a spectrogram. It does not change the signal in any way.
    </p>

    <p>
      Scroll over the oscilloscope (or use the <b>window</b> slider) to zoom in and out.
    </p>
  </>,
  create: createScopeNode
} satisfies NodeTypeDescriptor;

const LOG_MIN_TIME_WINDOW = Math.log10(MIN_TIME_WINDOW);
const LOG_MAX_TIME_WINDOW = Math.log10(MAX_TIME_WINDOW);

/** Converts a percentage to a time window, in seconds. */
function scalarToTimeWindow(x: number) {
  return logLerp(x / 100, LOG_MIN_TIME_WINDOW, LOG_MAX_TIME_WINDOW);
}

/** Inverse of `scalarToTimeWindow`. */
function timeWindowToScalar(x: number) {
  return invLogLerp(x, LOG_MIN_TIME_WINDOW, LOG_MAX_TIME_WINDOW) * 100;
}

export const ScopeNodeRenderer = memo(function ScopeNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ScopeNodeData>>
) {
  const [mode, setMode] = useBoundState(data, "mode");
  const [timeWindow, setTimeWindow] = useBoundState(data, "timeWindow");

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      className="w-[480px]"
      name="Scope"
      resizable={{ minWidth: 360, minHeight: 320 }}
      help={SCOPE_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6 flex-1 min-h-0">
        <div className="flex justify-between gap-4">
          <NodePort nodeId={id} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="input" />
          </NodePort>

          <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right" name="output" />
          </NodePort>
        </div>

        <AudioScope
          source={data.effect.gain} mode={mode} height={160} fill
          timeWindow={timeWindow} onTimeWindowChange={setTimeWindow}
        />

        <SelectField
          name="display"
          value={mode}
          onChange={x => setMode(x as ScopeMode)}
        >
          <option value="WAVEFORM">oscilloscope</option>
          <option value="SPECTRUM">spectrum</option>
          <option value="SPECTROGRAM">spectrogram</option>
        </SelectField>

        {
          mode != "WAVEFORM" ? <></> : (
            <SliderField
              name="window"
              min={0} max={100} value={timeWindowToScalar(timeWindow)} step={0.1}
              valueStringifier={x => formatMilliseconds(scalarToTimeWindow(x))}
              valueParser={x => timeWindowToScalar(clampTimeWindow(x / 1000))}
              onChange={x => setTimeWindow(scalarToTimeWindow(x))}
            />
          )
        }
      </div>
    </VestigeNodeBase>
  );
});
