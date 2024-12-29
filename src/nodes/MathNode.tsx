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
import { Automatable } from "../parameters";
import { useBoundState } from "../hooks";

type Operation =
  "ADD" |
  "SUBTRACT" |
  "MULTIPLY" |
  "DIVIDE" |
  "INVERT" |
  "LOG" |
  "SQRT" |
  "POW";

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
    b: this.prop(self => self.generator).with("b")
  }
}

export type MathNode = flow.Node<MathNodeData, "math">;

/** Creates a new `MathNode` with a random ID. */
export const createMathNode = makeNodeFactory("math", () => new MathNodeData());

/** Provides a `NodeTypeDescriptor` which describes math nodes. */
export const MATH_NODE_DESCRIPTOR = {
  displayName: "math",
  icon: cls => <RiCalculatorLine className={cls}/>,
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
      className="w-[350px]"
      name="math"
      help={<>
        The <b>math</b> node can perform arbitrary arithmetic on one or two value inputs.
        The value inputs are always in the range of 0.0 to 1.0 (0% to 100%), and the output
        value is always normalized to this range.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort nodeId={id} handleId={VALUE_OUTPUT_HID} kind="output" type="value">
            <PlainField name="value" description="the result of the calculation" align="right" />
          </NodePort>

          <SelectField
            name="operation"
            description="the operation to perform on A and B"
            value={operation}
            onChange={x => setOperation(x as Operation)}
          >
            <option value="ADD">add (A + B)</option>
            <option value="SUBTRACT">subtract (A - B)</option>
            <option value="MULTIPLY">multiply (A * B)</option>
            <option value="DIVIDE">divide (A / B)</option>
            <option value="INVERT">invert (1 - A)</option>
            <option value="LOG">logarithm (log(A, B))</option>
            <option value="SQRT">square root (√A)</option>
            <option value="POW">power (Aᴮ)</option>
          </SelectField>

          <NodePort nodeId={id} handleId={paramHandleId("a")} kind="input" type="value">
            <NumberField
              name="value A"
              description="a value, 0.0 to 1.0, to use as variable A"
              value={valA} onChange={setValA} step={0.25}
              automatable={data.parameters["param-a"]}
              automatableDisplay={() => data.generator.a}
            />
          </NodePort>

          <NodePort nodeId={id} handleId={paramHandleId("b")} kind="input" type="value">
            <NumberField
              name="value B"
              description="a value, 0.0 to 1.0, to use as variable B"
              value={!isSingleInput ? valB : NaN} onChange={setValB} step={0.25}
              automatable={data.parameters["param-b"]}
              automatableDisplay={() => data.generator.b}
              disabled={isSingleInput}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
