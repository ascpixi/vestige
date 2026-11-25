import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiCalculatorLine } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { paramHandleId, VALUE_OUTPUT_HID, ValueGenerator, ValueNodeData } from "../graph";
import { clamp } from "../util";
import { FlatNodeDataSerializer } from "../serializer";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { NumberField } from "../components/NumberField";
import { SelectField } from "../components/SelectField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { Automatable } from "../graph";
import { useBoundState } from "../hooks";

type Operation =
  "ADD" |
  "SUBTRACT" |
  "MULTIPLY" |
  "DIVIDE" |
  "INVERT" |
  "LOG" |
  "SQRT" |
  "POW" |
  "MIN" |
  "MAX" |
  "MODULO" |
  "GREATER" |
  "LESS";

function roundDecimals(value: number, places: number = 3) {
  const mult = Math.pow(10, places);
  return Math.round((value + Number.EPSILON) * mult) / mult;
}

export class MathNodeData extends ValueNodeData {
  generator = new MathValueGenerator();
  parameters = {
    "param-a": new Automatable(x => this.generator.a = x),
    "param-b": new Automatable(x => this.generator.b = x)
  };
};

export class MathValueGenerator implements ValueGenerator {
  a: number = 0;
  b: number = 0;
  operation: Operation = "ADD";

  private calculate(): number {
    switch (this.operation) {
      case "ADD": return this.a + this.b;
      case "SUBTRACT": return this.a - this.b;
      case "MULTIPLY": return this.a * this.b;
      case "DIVIDE": return this.a / this.b;
      case "INVERT": return 1 - this.a;
      case "LOG": return Math.log(this.a) / Math.log(this.b);
      case "SQRT": return Math.sqrt(this.a);
      case "POW": return Math.pow(this.a, this.b);
      case "MIN": return Math.min(this.a, this.b);
      case "MAX": return Math.max(this.a, this.b);
      case "MODULO": return this.b == 0 ? 0 : this.a % this.b;
      case "GREATER": return this.a > this.b ? 1 : 0;
      case "LESS": return this.a < this.b ? 1 : 0;
    }
  }

  generate(_: number): number {
    return clamp(this.calculate());
  }
}

export class MathNodeSerializer extends FlatNodeDataSerializer<MathNodeData> {
  type = "math";
  dataFactory = () => new MathNodeData();

  spec = {
    pa: this.prop(self => self.parameters["param-a"]).with("controlledBy"),
    pb: this.prop(self => self.parameters["param-b"]).with("controlledBy"),
    a: this.prop(self => self.generator).with("a"),
    b: this.prop(self => self.generator).with("b"),
    o: this.prop(self => self.generator).with("operation", "ADD") // since Vestige 0.6.0
  }
}

export type MathNode = flow.Node<MathNodeData, "math">;

/** Creates a new `MathNode` with a random ID. */
export const createMathNode = makeNodeFactory("math", () => new MathNodeData());

/** Provides a `NodeTypeDescriptor` which describes math nodes. */
export const MATH_NODE_DESCRIPTOR = {
  displayName: "Math",
  icon: cls => <RiCalculatorLine className={cls}/>,
  help: <>
    The <b>math</b> node can perform arbitrary arithmetic on one or two values. The values are
    always in the range of 0.0 to 1.0 (0% to 100%), and the result is always limited to be in
    this range.
  </>,
  create: createMathNode
} satisfies NodeTypeDescriptor;

export const MathNodeRenderer = memo(function MathNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<MathNodeData>>
) {
  const gen = data.generator;

  const [operation, setOperation] = useBoundState(gen, "operation");
  const [valA, setValA] = useBoundState(gen, "a");
  const [valB, setValB] = useBoundState(gen, "b");

  const isSingleInput = operation == "INVERT" || operation == "SQRT";

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      className="w-[300px]"
      name="Math"
      help={MATH_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <NodePort nodeId={id} handleId={VALUE_OUTPUT_HID} kind="output" type="value">
          <PlainField name="value" align="right" />
        </NodePort>

        <SelectField
          name="operation"
          value={operation}
          onChange={x => setOperation(x as Operation)}
        >
          <optgroup label="functions">
            <option value="ADD">add</option>
            <option value="SUBTRACT">subtract</option>
            <option value="MULTIPLY">multiply</option>
            <option value="DIVIDE">divide</option>
            <option value="POW">power</option>
            <option value="LOG">logarithm</option>
            <option value="SQRT">square root</option>
            <option value="INVERT">invert (1 - A)</option>
          </optgroup>

          <optgroup label="comparison">
            <option value="MIN">minimum</option>
            <option value="MAX">maximum</option>
            <option value="GREATER">greater than</option>
            <option value="LESS">less than</option>
            <option value="MODULO">modulo</option>
          </optgroup>
        </SelectField>

        <NodePort nodeId={id} handleId={paramHandleId("a")} kind="input" type="value">
          <NumberField
            name="A"
            value={valA} onChange={setValA} step={0.05}
            automatable={data.parameters["param-a"]}
            automatableDisplay={() => roundDecimals(data.generator.a)}
          />
        </NodePort>

        <NodePort nodeId={id} handleId={paramHandleId("b")} kind="input" type="value">
          <NumberField
            name="B"
            value={!isSingleInput ? valB : NaN} onChange={setValB} step={0.05}
            automatable={data.parameters["param-b"]}
            automatableDisplay={() => roundDecimals(data.generator.b)}
            disabled={isSingleInput}
          />
        </NodePort>
      </div>
    </VestigeNodeBase>
  );
});
