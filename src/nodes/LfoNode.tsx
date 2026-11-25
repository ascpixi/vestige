import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiPulseFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { percentageUnit, VALUE_OUTPUT_HID, ValueGenerator, ValueNodeData } from "../graph";
import { hashify, invLogLerp, logLerp, match } from "../util";
import { FlatNodeDataSerializer } from "../serializer";
import { useTargetUnit, useTempoSync } from "../hooks";
import { DEFAULT_BPM, divisionLength } from "../transport";
import { DivisionField, SyncToggle } from "../components/TempoSync";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SliderField } from "../components/SliderField";
import { SelectField } from "../components/SelectField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { ValueGraph } from "../components/viz/ValueGraph";

type LfoShape = "sine" | "triangle" | "square" | "saw" | "random";

const lfoSin = (t: number, f: number) => Math.sin(2 * Math.PI * t * f);
const lfoTri = (t: number, f: number) => 1 - 4 * Math.abs(((t * f + 0.25) % 1) - 0.5);
const lfoSqr = (t: number, f: number) => (t * f) % 1 < 0.5 ? 1 : -1;
const lfoSaw = (t: number, f: number) => 2 * ((t * f) % 1) - 1;

/** The seed of the random LFO shape. */
const RANDOM_SEED = 0x5EED;

function lfoRnd(t: number, f: number) {
  // Each cycle has its own value, which is always the same for the same point in time.
  const hash = hashify(Math.floor(t * f) + RANDOM_SEED) >>> 0;
  return (hash % 10_000) / 5_000 - 1;
}

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
  sync: boolean = false;
  division: string = "1bar";
  bpm: number = DEFAULT_BPM;
  lastTime: number = 0;

  /** The frequency of the LFO, in Hz, taking tempo sync into account. */
  get rate() {
    return this.sync ? 1 / divisionLength(this.division, this.bpm) : this.frequency;
  }

  /** Gets the value of the LFO at the given time, without affecting its state. */
  valueAt(time: number): number {
    const wave = match(this.shape, {
      "sine": lfoSin(time, this.rate),
      "triangle": lfoTri(time, this.rate),
      "square": lfoSqr(time, this.rate),
      "saw": lfoSaw(time, this.rate),
      "random": lfoRnd(time, this.rate)
    });

    return scale(biToUni(wave), this.min, this.max);
  }

  generate(time: number): number {
    this.lastTime = time;
    return this.valueAt(time);
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
    y: this.prop(self => self.generator).with("sync", false), // since Vestige 0.6.0
    v: this.prop(self => self.generator).with("division", "1bar"), // since Vestige 0.6.0
    t: this.prop(self => self.generator).with("bpm", DEFAULT_BPM), // since Vestige 0.6.0
  }
}

export type LfoNode = flow.Node<LfoNodeData, "lfo">

/** Creates a new `LfoNode` with a random ID. */
export const createLfoNode = makeNodeFactory("lfo", () => new LfoNodeData());

/** Provides a `NodeTypeDescriptor` which describes LFO nodes. */
export const LFO_NODE_DESCRIPTOR = {
  displayName: "LFO",
  icon: cls => <RiPulseFill className={cls}/>,
  help: <>
    <p>
      An LFO (Low Frequency Oscillator) provides a value that changes over time, always staying
      between its <b>min</b> and <b>max</b>. You can use it to introduce some movement into
      your composition!
    </p>

    <p>
      With the <b>random</b> shape, the LFO picks a new value on every cycle.
    </p>
  </>,
  create: createLfoNode
} satisfies NodeTypeDescriptor;

const MAX_LFO_SPEED_HZ = 20; // 20 Hz is pretty darn fast for an LFO
const MAX_LOG_SPEED_HZ_LOG10 = Math.log10(MAX_LFO_SPEED_HZ);

const scalarToRate = (x: number) => logLerp(x / 100, -1, MAX_LOG_SPEED_HZ_LOG10);
const rateToScalar = (x: number) => invLogLerp(x, -1, MAX_LOG_SPEED_HZ_LOG10) * 100;

export const LfoNodeRenderer = memo(function LfoNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<LfoNodeData>>
) {
  const lfo = data.generator;

  const [shape, setShape] = useState<LfoShape>(lfo.shape);
  const [frequency, setFrequency] = useState(rateToScalar(lfo.frequency));
  const [min, setMin] = useState(lfo.min * 100);
  const [max, setMax] = useState(lfo.max * 100);

  const { sync, onSyncChange, division, setDivision, bpm, setBpm } = useTempoSync(
    lfo,
    () => 1 / scalarToRate(frequency)
  );

  const unit = useTargetUnit(id);
  const secondaryUnit = unit ? percentageUnit(unit) : undefined;

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
    lfo.frequency = scalarToRate(frequency);
    lfo.max = max / 100;
    lfo.min = min / 100;
  }, [lfo, shape, frequency, min, max]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="LFO"
      help={LFO_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <NodePort nodeId={id} handleId={VALUE_OUTPUT_HID} kind="output" type="value">
          <PlainField name="value" align="right" />
        </NodePort>

        <ValueGraph
          valueAt={t => lfo.valueAt(t)}
          now={() => lfo.lastTime}
          span={() => 2 / lfo.rate}
          min={() => lfo.min}
          max={() => lfo.max}
          label={() => `${lfo.rate.toFixed(2)} Hz`}
        />

        <SelectField
          name="shape"
          value={shape}
          onChange={x => setShape(x as LfoShape)}
        >
          <option value="sine">sine</option>
          <option value="triangle">triangle</option>
          <option value="square">square</option>
          <option value="saw">saw</option>
          <option value="random">random</option>
        </SelectField>

        {
          sync ? (
            <DivisionField
              name="cycle"
              value={division} onChange={setDivision}
              bpm={bpm} onBpmChange={setBpm}
              onSyncedChange={onSyncChange}
            />
          ) : (
            <SliderField
              name="rate"
              min={0} max={100} value={frequency} step={0.1}
              valueStringifier={x => `${scalarToRate(x).toFixed(2)} Hz`}
              valueParser={rateToScalar}
              onChange={setFrequency}
              headerAccessory={<SyncToggle synced={false} onChange={onSyncChange}/>}
            />
          )
        }

        <div className="grid grid-cols-2 gap-4">
          <SliderField
            name="min"
            min={0} max={100} value={min} isPercentage
            secondaryUnit={secondaryUnit}
            onChange={onMinChange}
          />

          <SliderField
            name="max"
            min={0} max={100} value={max} isPercentage
            secondaryUnit={secondaryUnit}
            onChange={onMaxChange}
          />
        </div>
      </div>
    </VestigeNodeBase>
  );
});
