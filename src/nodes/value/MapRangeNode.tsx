import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiArrowLeftRightLine } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { Automatable, paramHandleId, VALUE_OUTPUT_HID, ValueGenerator, ValueNodeData } from "../../graph";
import { clamp, lerp, range, smootherstep } from "../../util";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { SelectField } from "../../components/SelectField";
import { CheckboxField } from "../../components/CheckboxField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { clearViz, drawDot, strokePoints, VizCanvas } from "../../components/viz/VizCanvas";

type Interpolation = "LINEAR" | "STEPPED" | "SMOOTHSTEP" | "SMOOTHERSTEP";

export class MapRangeNodeData extends ValueNodeData {
  generator = new MapRangeValueGenerator();
  parameters = {
    "param-value": new Automatable(x => this.generator.input = x)
  };
};

export class MapRangeValueGenerator implements ValueGenerator {
  input: number = 0.5;
  fromMin: number = 0;
  fromMax: number = 1;
  toMin: number = 0;
  toMax: number = 1;
  steps: number = 4;
  interpolation: Interpolation = "LINEAR";
  clamp: boolean = true;

  /** Maps the given value according to the parameters of this generator. */
  map(x: number) {
    const fromRange = this.fromMax - this.fromMin;
    let t = fromRange == 0 ? 0 : (x - this.fromMin) / fromRange;

    if (this.clamp || this.interpolation != "LINEAR") {
      t = clamp(t);
    }

    switch (this.interpolation) {
      case "STEPPED":
        t = Math.floor(t * this.steps) / this.steps;
        break;

      case "SMOOTHSTEP":
        t = t * t * (3 - 2 * t);
        break;

      case "SMOOTHERSTEP":
        t = smootherstep(t);
        break;
    }

    return lerp(this.toMin, this.toMax, t);
  }

  generate(_: number): number {
    return clamp(this.map(this.input));
  }
}

export class MapRangeNodeSerializer extends FlatNodeDataSerializer<MapRangeNodeData> {
  type = "map-range";
  dataFactory = () => new MapRangeNodeData();

  spec = {
    pv: this.prop(self => self.parameters["param-value"]).with("controlledBy"),
    v: this.prop(self => self.generator).with("input"),
    a: this.prop(self => self.generator).with("fromMin"),
    b: this.prop(self => self.generator).with("fromMax"),
    c: this.prop(self => self.generator).with("toMin"),
    d: this.prop(self => self.generator).with("toMax"),
    s: this.prop(self => self.generator).with("steps"),
    i: this.prop(self => self.generator).with("interpolation"),
    l: this.prop(self => self.generator).with("clamp")
  }
}

export type MapRangeNode = flow.Node<MapRangeNodeData, "map-range">

/** Creates a new `MapRangeNode` with a random ID. */
export const createMapRangeNode = makeNodeFactory("map-range", () => new MapRangeNodeData());

/** Provides a `NodeTypeDescriptor` which describes map range nodes. */
export const MAP_RANGE_NODE_DESCRIPTOR = {
  displayName: "Map Range",
  icon: cls => <RiArrowLeftRightLine className={cls}/>,
  help: <>
    The <b>map range</b> node converts a value in the <b>from</b> range to a value in
    the <b>to</b> range. You can set the minimum above the maximum in order to invert the value.
  </>,
  create: createMapRangeNode
} satisfies NodeTypeDescriptor;

/** The distance between the transfer curve and the edges of the canvas, in pixels. */
const PADDING = 6;

/** Plots the transfer curve of a map range generator, marking its current input. */
function TransferCurve({ gen }: { gen: MapRangeValueGenerator }) {
  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const toX = (x: number) => PADDING + x * (width - PADDING * 2);
    const toY = (y: number) => PADDING + (1 - clamp(y)) * (height - PADDING * 2);

    clearViz(ctx, width, height);

    const pointCount = Math.round(width);
    const points = range(pointCount + 1).map(i => ({
      x: toX(i / pointCount),
      y: toY(gen.map(i / pointCount))
    }));

    strokePoints(ctx, points);
    drawDot(ctx, toX(gen.input), toY(gen.map(gen.input)));
  }

  return <VizCanvas draw={draw} height={80} />;
}

export const MapRangeNodeRenderer = memo(function MapRangeNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<MapRangeNodeData>>
) {
  const gen = data.generator;

  const [input, setInput] = useBoundState(gen, "input");
  const [fromMin, setFromMin] = useBoundState(gen, "fromMin");
  const [fromMax, setFromMax] = useBoundState(gen, "fromMax");
  const [toMin, setToMin] = useBoundState(gen, "toMin");
  const [toMax, setToMax] = useBoundState(gen, "toMax");
  const [steps, setSteps] = useBoundState(gen, "steps");
  const [interpolation, setInterpolation] = useBoundState(gen, "interpolation");
  const [shouldClamp, setShouldClamp] = useBoundState(gen, "clamp");

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      className="w-[320px]"
      name="Map Range"
      help={MAP_RANGE_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <NodePort nodeId={id} handleId={VALUE_OUTPUT_HID} kind="output" type="value">
          <PlainField name="result" align="right" />
        </NodePort>

        <TransferCurve gen={gen} />

        <NodePort nodeId={id} handleId={paramHandleId("value")} kind="input" type="value">
          <SliderField
            name="value"
            min={0} max={100} value={input * 100} isPercentage
            onChange={x => setInput(x / 100)}
            automatable={data.parameters["param-value"]}
            automatableDisplay={() => gen.input * 100}
          />
        </NodePort>

        <div className="grid grid-cols-2 gap-4">
          <SliderField
            name="from min"
            min={0} max={100} value={fromMin * 100} isPercentage
            onChange={x => setFromMin(x / 100)}
          />

          <SliderField
            name="from max"
            min={0} max={100} value={fromMax * 100} isPercentage
            onChange={x => setFromMax(x / 100)}
          />

          <SliderField
            name="to min"
            min={0} max={100} value={toMin * 100} isPercentage
            onChange={x => setToMin(x / 100)}
          />

          <SliderField
            name="to max"
            min={0} max={100} value={toMax * 100} isPercentage
            onChange={x => setToMax(x / 100)}
          />
        </div>

        <SelectField
          name="interpolation"
          value={interpolation}
          onChange={x => setInterpolation(x as Interpolation)}
        >
          <option value="LINEAR">linear</option>
          <option value="STEPPED">stepped</option>
          <option value="SMOOTHSTEP">smooth step</option>
          <option value="SMOOTHERSTEP">smoother step</option>
        </SelectField>

        {
          interpolation != "STEPPED" ? <></> : (
            <SliderField
              name="steps"
              min={1} max={16} value={steps}
              onChange={x => setSteps(Math.round(x))}
            />
          )
        }

        {
          interpolation != "LINEAR" ? <></> : (
            <CheckboxField name="clamp" value={shouldClamp} onChange={setShouldClamp} />
          )
        }
      </div>
    </VestigeNodeBase>
  );
});
