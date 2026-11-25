import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiHashtag } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { VALUE_OUTPUT_HID, ValueGenerator, ValueNodeData } from "../../graph";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";

export class ConstantValueNodeData extends ValueNodeData {
  generator = new ConstantValueGenerator();
};

export class ConstantValueGenerator implements ValueGenerator {
  value: number = 0.5;

  generate(_: number): number {
    return this.value;
  }
}

export class ValueNodeSerializer extends FlatNodeDataSerializer<ConstantValueNodeData> {
  type = "value";
  dataFactory = () => new ConstantValueNodeData();

  spec = {
    v: this.prop(self => self.generator).with("value")
  }
}

export type ValueNode = flow.Node<ConstantValueNodeData, "value">

/** Creates a new `ValueNode` with a random ID. */
export const createValueNode = makeNodeFactory("value", () => new ConstantValueNodeData());

/** Provides a `NodeTypeDescriptor` which describes value nodes. */
export const VALUE_NODE_DESCRIPTOR = {
  displayName: "Value",
  icon: cls => <RiHashtag className={cls}/>,
  help: <>
    The <b>value</b> node provides a constant value. You can connect it to several parameters
    in order to control all of them from a single place.
  </>,
  create: createValueNode
} satisfies NodeTypeDescriptor;

export const ValueNodeRenderer = memo(function ValueNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ConstantValueNodeData>>
) {
  const [value, setValue] = useBoundState(data.generator, "value");

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      className="w-[260px]"
      name="Value"
      help={VALUE_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6">
        <NodePort nodeId={id} handleId={VALUE_OUTPUT_HID} kind="output" type="value">
          <PlainField name="value" align="right" />
        </NodePort>

        <SliderField
          name="value"
          min={0} max={100} value={value * 100} step={0.1}
          valueStringifier={x => `${x.toFixed(1)}%`}
          onChange={x => setValue(x / 100)}
        />
      </div>
    </VestigeNodeBase>
  );
});
