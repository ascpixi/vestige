import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiPulseFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { VALUE_OUTPUT_HID, ValueGenerator, ValueNodeData } from "../graph";
import { invLogLerp, logLerp } from "../util";
import { FlatNodeDataSerializer } from "../serializer";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SliderField } from "../components/SliderField";
import { SelectField } from "../components/SelectField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

type LfoShape = "sine" | "square" | "saw";

const lfoSin = (t: number, f: number) => Math.sin(2 * Math.PI * t * f);
const lfoSqr = (t: number, f: number) => (t * f) % 1 < 0.5 ? 1 : -1;
const lfoSaw = (t: number, f: number) => 2 * ((t * f) % 1) - 1;

/**
 * Scales the normalized value `x` (from 0.0 to 1.0) to a value between `min` and `max`.
 */
function scale(x: number, min: number, max: number) {
  return min + x * (max - min);
}

/**
 * Converts from a bipolar value (-1.0 to 1.0) to a unipolar one (0.0 to 1.0).
 */
function biToUni(x: number) {
  return (x + 1) / 2;
}

export class LfoNodeData extends ValueNodeData {
  generator = new LfoValueGenerator();
};

export class LfoValueGenerator implements ValueGenerator {
  shape: LfoShape = "sine";
  frequency: number = 1;
  min: number = 0;
  max: number = 1;

  generate(time: number): number {
    switch (this.shape) {
      case "sine":
        return scale(biToUni(lfoSin(time, this.frequency)), this.min, this.max);
      case "square":
        return scale(biToUni(lfoSqr(time, this.frequency)), this.min, this.max);
      case "saw":
        return scale(biToUni(lfoSaw(time, this.frequency)), this.min, this.max);
    }
  }
}

export class LfoNodeSerializer extends FlatNodeDataSerializer<LfoNodeData> {
  type = "lfo";
  dataFactory = () => new LfoNodeData();

  spec = {
    s: this.prop(self => self.generator).with("shape"),
    f: this.prop(self => self.generator).with("frequency"),
    a: this.prop(self => self.generator).with("min"),
    b: this.prop(self => self.generator).with("max"),
  }
}

export type LfoNode = flow.Node<LfoNodeData, "lfo">

/** Creates a new `LfoNode` with a random ID. */
export const createLfoNode = makeNodeFactory("lfo", () => new LfoNodeData());

/** Provides a `NodeTypeDescriptor` which describes LFO nodes. */
export const LFO_NODE_DESCRIPTOR = {
  displayName: "LFO (time-changing value)",
  icon: cls => <RiPulseFill className={cls}/>,
  create: createLfoNode
} satisfies NodeTypeDescriptor;

const MAX_LFO_SPEED_HZ = 20; // 20 Hz is pretty darn fast for an LFO
const MAX_LOG_SPEED_HZ_LOG10 = Math.log10(MAX_LFO_SPEED_HZ);

export const LfoNodeRenderer = memo(function LfoNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<LfoNodeData>>
) {
  const lfo = data.generator;

  const [shape, setShape] = useState<LfoShape>(lfo.shape);
  const [frequency, setFrequency] = useState(invLogLerp(lfo.frequency, -1, MAX_LOG_SPEED_HZ_LOG10) * 100);
  const [min, setMin] = useState(lfo.min * 100);
  const [max, setMax] = useState(lfo.max * 100);

  function onMinChange(newMin: number) {
    if (newMin > max) return;
    setMin(newMin);
  }

  function onMaxChange(newMax: number) {
    if (newMax < min) return;
    setMax(newMax);
  }

  useEffect(() => {
    lfo.shape = shape;
    lfo.frequency = logLerp(frequency / 100, -1, MAX_LOG_SPEED_HZ_LOG10);
    lfo.max = max / 100;
    lfo.min = min / 100;
  }, [lfo, shape, frequency, min, max]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="LFO (time-changing value)"
      help={<>
        An LFO (Low Frequency Oscillator) is a node that is designed to provide
        a value that slowly changes over time. You can use it to introduce
        some movement into your composition!

        <br/><br/>

        There are three shapes an LFO can have:
        <ul>
          <li><b>sine</b>: smoothly goes up and down in value over time</li>
          <li><b>square</b>: snaps from maximum to minimum, up, down, up, down...</li>
          <li><b>saw</b>: goes from minimum and maximum, then suddenly resets</li>
        </ul>
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={VALUE_OUTPUT_HID} kind="output" type="value">
            <PlainField name="value" description="the current value of the LFO" align="right" />
          </NodePort>

          <SelectField
            name="shape"
            description="determines how the LFO goes from minimum to maximum"
            value={shape}
            onChange={x => setShape(x as LfoShape)}
          >
            <option value="sine">sine (smooth)</option>
            <option value="square">square (up-down)</option>
            <option value="saw">saw (goes up, then resets)</option>
          </SelectField>

          <SliderField
            name="frequency (speed)"
            description="how fast the LFO is, in Hz - the amount of full cycles done per second"
            min={0} max={100} value={frequency}
            valueStringifier={x => `${logLerp(x / 100, -1, MAX_LOG_SPEED_HZ_LOG10).toFixed(2)} Hz`}
            onChange={setFrequency}
          />

          <SliderField
            name="minimum value"
            description="the lowest value the LFO can reach"
            min={0} max={100} value={min} isPercentage
            onChange={onMinChange}
          />

          <SliderField
            name="maximum value"
            description="the highest value the LFO can reach"
            min={0} max={100} value={max} isPercentage
            onChange={onMaxChange}
          />
        </div>
      </div>
    </VestigeNodeBase>
  );
});
