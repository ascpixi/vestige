import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiBubbleChartFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { percentageUnit, VALUE_OUTPUT_HID, ValueGenerator, ValueNodeData } from "../../graph";
import { hashify, invLogLerp, lerp, logLerp, smootherstep } from "../../util";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState, useTargetUnit, useTempoSync } from "../../hooks";
import { DEFAULT_BPM, divisionLength } from "../../transport";
import { DivisionField, SyncToggle } from "../../components/TempoSync";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { ValueGraph } from "../../components/viz/ValueGraph";

const LOG_MIN_RATE = -2; // 0.01 Hz
const LOG_MAX_RATE = Math.log10(20);

const MAX_DETAIL = 4;

/** Returns a pseudo-random value in the range of [0.0; 1.0] for the given lattice point. */
function lattice(x: number, seed: number) {
  return ((hashify(x * 7919 + seed) >>> 0) % 65_536) / 65_535;
}

/** Evaluates smooth one-dimensional value noise at `x`, returning a value from 0.0 to 1.0. */
function valueNoise(x: number, seed: number) {
  const point = Math.floor(x);
  const offset = x - point;
  const start = lattice(point, seed);
  const end = lattice(point + 1, seed);

  return lerp(start, end, smootherstep(offset));
}

export class NoiseNodeData extends ValueNodeData {
  generator = new NoiseValueGenerator();
};

export class NoiseValueGenerator implements ValueGenerator {
  rate: number = 0.5;
  detail: number = 1;
  roughness: number = 0.5;
  min: number = 0;
  max: number = 1;
  seed: number = Math.floor(Math.random() * 10_000);
  sync: boolean = false;
  division: string = "1/4";
  bpm: number = DEFAULT_BPM;
  lastTime: number = 0;

  /** The rate of the noise, in Hz, taking tempo sync into account. */
  get effectiveRate() {
    return this.sync ? 1 / divisionLength(this.division, this.bpm) : this.rate;
  }

  /** Gets the value of the noise at the given time, without affecting its state. */
  valueAt(time: number): number {
    let sum = 0;
    let amplitude = 1;
    let total = 0;
    let frequency = this.effectiveRate;

    // We use fractal (fBm) noise: each octave doubles the frequency, and scales down the amplitude.
    for (let octave = 0; octave < this.detail; octave++) {
      sum += valueNoise(time * frequency, this.seed + octave * 101) * amplitude;
      total += amplitude;
      amplitude *= this.roughness;
      frequency *= 2;
    }

    return lerp(this.min, this.max, sum / total);
  }

  generate(time: number): number {
    this.lastTime = time;
    return this.valueAt(time);
  }
}

export class NoiseNodeSerializer extends FlatNodeDataSerializer<NoiseNodeData> {
  type = "noise";
  dataFactory = () => new NoiseNodeData();

  spec = {
    r: this.prop(self => self.generator).with("rate"),
    d: this.prop(self => self.generator).with("detail"),
    g: this.prop(self => self.generator).with("roughness"),
    a: this.prop(self => self.generator).with("min"),
    b: this.prop(self => self.generator).with("max"),
    s: this.prop(self => self.generator).with("seed"),
    y: this.prop(self => self.generator).with("sync", false), // since Vestige 0.6.0
    v: this.prop(self => self.generator).with("division", "1/4"), // since Vestige 0.6.0
    t: this.prop(self => self.generator).with("bpm", DEFAULT_BPM) // since Vestige 0.6.0
  }
}

export type NoiseNode = flow.Node<NoiseNodeData, "noise">

/** Creates a new `NoiseNode` with a random ID. */
export const createNoiseNode = makeNodeFactory("noise", () => new NoiseNodeData());

/** Provides a `NodeTypeDescriptor` which describes noise nodes. */
export const NOISE_NODE_DESCRIPTOR = {
  displayName: "Noise",
  icon: cls => <RiBubbleChartFill className={cls}/>,
  help: <>
    The <b>noise</b> node provides a random value that changes smoothly over time.
    The <b>detail</b> adds faster changes on top of it, and the <b>roughness</b> determines how
    noticeable they are.
  </>,
  create: createNoiseNode
} satisfies NodeTypeDescriptor;

const scalarToRate = (x: number) => logLerp(x / 100, LOG_MIN_RATE, LOG_MAX_RATE);
const rateToScalar = (x: number) => invLogLerp(x, LOG_MIN_RATE, LOG_MAX_RATE) * 100;

export const NoiseNodeRenderer = memo(function NoiseNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<NoiseNodeData>>
) {
  const gen = data.generator;

  const [rate, setRate] = useState(rateToScalar(gen.rate));
  const [detail, setDetail] = useBoundState(gen, "detail");
  const [roughness, setRoughness] = useState(gen.roughness * 100);
  const [min, setMin] = useState(gen.min * 100);
  const [max, setMax] = useState(gen.max * 100);

  const { sync, onSyncChange, division, setDivision, bpm, setBpm } = useTempoSync(
    gen,
    () => 1 / scalarToRate(rate)
  );

  const unit = useTargetUnit(id);
  const secondaryUnit = unit ? percentageUnit(unit) : undefined;

  function onMinChange(newMin: number) {
    if (newMin > max)
      return;

    setMin(newMin);
  }

  function onMaxChange(newMax: number) {
    if (newMax < min)
      return;

    setMax(newMax);
  }

  useEffect(() => {
    gen.rate = scalarToRate(rate);
    gen.roughness = roughness / 100;
    gen.min = min / 100;
    gen.max = max / 100;
  }, [gen, rate, roughness, min, max]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="Noise"
      help={NOISE_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <NodePort nodeId={id} handleId={VALUE_OUTPUT_HID} kind="output" type="value">
          <PlainField name="value" align="right" />
        </NodePort>

        <ValueGraph
          valueAt={t => gen.valueAt(t)}
          now={() => gen.lastTime}
          span={() => 4 / gen.effectiveRate}
          min={() => gen.min}
          max={() => gen.max}
        />

        {
          sync ? (
            <DivisionField
              name="step"
              value={division} onChange={setDivision}
              bpm={bpm} onBpmChange={setBpm}
              onSyncedChange={onSyncChange}
            />
          ) : (
            <SliderField
              name="rate"
              min={0} max={100} value={rate} step={0.1}
              valueStringifier={x => `${scalarToRate(x).toFixed(2)} Hz`}
              valueParser={rateToScalar}
              onChange={setRate}
              headerAccessory={<SyncToggle synced={false} onChange={onSyncChange}/>}
            />
          )
        }

        <div className="grid grid-cols-2 gap-4">
          <SliderField
            name="detail"
            min={1} max={MAX_DETAIL} value={detail}
            onChange={x => setDetail(Math.round(x))}
          />

          <SliderField
            name="roughness"
            min={0} max={100} value={roughness} isPercentage
            onChange={setRoughness}
          />

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
