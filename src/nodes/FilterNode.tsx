import { memo, useEffect, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import * as tone from "tone";

import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { SelectField } from "../components/SelectField";
import { AudioDestination, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../graph";
import { SliderField } from "../components/SliderField";
import { Automatable } from "../parameters";
import { assert, invLogLerp, logLerp, match } from "../util";
import { makeNodeFactory, NodeTypeDescriptor } from ".";
import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { toneFreq } from "../audioUtil";
import { RiEqualizerFill } from "@remixicon/react";
import { NodeDataSerializer } from "../serializer";

type FilterType = "lowpass" | "bandpass" | "highpass";

export class FilterNodeData extends EffectNodeData {
  effect: FilterAudioEffect;
  parameters: {
    "param-cutoff": Automatable,
    "param-resonance": Automatable
  } & Record<string, Automatable>

  constructor() {
    super();

    this.effect = new FilterAudioEffect();

    const flt = this.effect.filter;
    this.parameters = {
      "param-cutoff": new Automatable(x => flt.frequency.value = cutoffScalarToHz(x)),
      "param-resonance": new Automatable(x => flt.Q.value = scalarToResonance(x))
    };
  }
};

export class FilterAudioEffect implements AudioEffect {
  filter: tone.Filter;

  connectTo(dst: AudioDestination): void {
    dst.accept(this.filter);
  }

  disconnect() {
    this.filter.disconnect();
  }

  dispose() {
    this.disconnect();
    this.filter.dispose();
  }

  getConnectDestination(handleId: string) {
    assert(handleId == SIGNAL_INPUT_HID_MAIN, `Unknown signal input handle ID ${handleId}`);
    return unaryAudioDestination(this.filter);
  }

  constructor() {
    this.filter = new tone.Filter({
      frequency: cutoffScalarToHz(0.5),
      Q: scalarToResonance(0.5),
      rolloff: -24,
      type: "lowpass"
    });
  }
}

export class FilterNodeSerializer implements NodeDataSerializer<FilterNodeData> {
  type = "filter"

  serialize(obj: FilterNodeData) {
    const params = obj.parameters;
    const flt = obj.effect.filter;

    return {
      pc: params["param-cutoff"].controlledBy,
      pq: params["param-resonance"].controlledBy,
      c: tone.Frequency(flt.frequency.value).toFrequency(),
      q: flt.Q.value,
      r: flt.rolloff
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): FilterNodeData {
    const data = new FilterNodeData();
    const params = data.parameters;
    const flt = data.effect.filter;

    params["param-cutoff"].controlledBy = serialized.pc;
    params["param-resonance"].controlledBy = serialized.pq;
    flt.frequency.value = serialized.c;
    flt.Q.value = serialized.q;
    flt.rolloff = serialized.r;

    return data;
  }
}

export type FilterNode = Node<FilterNodeData, "filter">

/** Creates a new `FilterNode` with a random ID. */
export const createFilterNode = makeNodeFactory("filter", () => new FilterNodeData());

/** Provides a `NodeTypeDescriptor` which describes filter nodes. */
export const FILTER_NODE_DESCRIPTOR = {
  displayName: "filter",
  icon: cls => <RiEqualizerFill className={cls}/>,
  create: createFilterNode
} satisfies NodeTypeDescriptor;

const LOG_MIN_FREQ = Math.log10(20);
const LOG_MAX_FREQ = Math.log10(22_000);

const MAX_Q = 5;

/**
 * Converts a cutoff value in the range of [0.0; 1.0] to a value in the range
 * of [20; 22000], scaling logarithmically, so that lower frequencies get prioritized.
 */
const cutoffScalarToHz = (x: number) => logLerp(x, LOG_MIN_FREQ, LOG_MAX_FREQ);
const hzToCutoffScalar = (x: number) => invLogLerp(x, LOG_MIN_FREQ, LOG_MAX_FREQ);

const scalarToResonance = (x: number) => x * MAX_Q;
const resonanceToScalar = (x: number) => x / MAX_Q;

export const FilterNodeRenderer = memo(function FilterNodeRenderer(
  { id, data }: NodeProps<Node<FilterNodeData>>
) {
  const [type, setType] = useState<FilterType>(data.effect.filter.type as FilterType);

  const [cutoff, setCutoff] = useState<number>(hzToCutoffScalar(tone.Frequency(data.effect.filter.frequency.value).toFrequency()) * 100);
  const [resonance, setResonance] = useState<number>(resonanceToScalar(data.effect.filter.Q.value) * 100);
  
  const [intensity, setIntensity] = useState<number>(
    match(data.effect.filter.rolloff, {
      [-12]: 1,
      [-24]: 2,
      [-48]: 3,
      [-96]: 4,
    }
  ));

  const rolloffDbPerOct = match(intensity - 1, {
    0: -12,
    1: -24,
    2: -48,
    3: -96
  }) as tone.FilterRollOff;

  useEffect(() => {
    data.effect.filter.type = type;
  }, [data, type]);

  useEffect(() => {
    data.effect.filter.rolloff = rolloffDbPerOct;
  }, [data, rolloffDbPerOct]);

  useEffect(() => {
    const params = data.parameters;

    if (!params["param-cutoff"].isAutomated()) {
      params["param-cutoff"].change(cutoff / 100);
    }

    if (!params["param-resonance"].isAutomated()) {
      params["param-resonance"].change(resonance / 100);
    }
  }, [data, cutoff, resonance]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.effect.dispose()}
      name="filter"
      help={<>
        A filter removes certain frequencies, an attenuates others - for example,
        the low-pass filter will muffle the sound, depending on the <b>cutoff</b>.
        Automating the cutoff with the <b>LFO (time-changing value)</b> node can
        introduce some movement into your composition!

        <br/><br/>

        The <b>resonance</b> parameter determines how "relaxed" the filter is.
        Larger values mean that the <b>cutoff frequency</b> gets attenuated more,
        but masked frequencies get masked... more.


      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort offset={20} handleId={SIGNAL_INPUT_HID_MAIN} kind="input" type="signal">
            <PlainField name="main input" description="the audio to filter" />
          </NodePort>

          <NodePort offset={80} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the filtered audio"
            />
          </NodePort>

          <SelectField
            name="type"
            description="the way the filter masks the audio"
            value={type}
            onChange={x => setType(x as FilterType)}
          >
            <option value="lowpass">low-pass (muffles audio, keeps only bass)</option>
            <option value="bandpass">band-pass (keeps only mid frequencies)</option>
            <option value="highpass">high-pass (crisps audio, removes bass and mids)</option>
          </SelectField>

          <NodePort offset={236} handleId={paramHandleId("cutoff")} kind="input" type="value">
            <SliderField
              name="cutoff"
              description="where the filter ends (low-pass), begins (high-pass) or its center (band-pass)"
              min={0} max={100} value={cutoff}
              valueStringifier={x => `${cutoffScalarToHz(x / 100).toFixed(2)} Hz`}
              onChange={setCutoff}
              automatable={data.parameters["param-cutoff"]}
              automatableDisplay={() => hzToCutoffScalar(toneFreq(data.effect.filter.frequency.value)) * 100}
            />
          </NodePort>

          <SliderField
            name="rolloff (intensity)"
            description="how intense the filter is, measured in dB per octave"
            min={1} max={4} value={intensity}
            valueStringifier={() => `${rolloffDbPerOct} dB per octave`}
            onChange={setIntensity}
          />

          <NodePort offset={428} handleId={paramHandleId("resonance")} kind="input" type="value">
            <SliderField
              name="resonance (sharpness)"
              description="also known as the 'Q' value. high values cause a 'laser' effect."
              min={0} max={100} value={resonance} isPercentage
              onChange={setResonance}
              automatable={data.parameters["param-resonance"]}
              automatableDisplay={() => resonanceToScalar(data.effect.filter.Q.value) * 100}
            />
          </NodePort>
        </div>
      </div>
    </VestigeNodeBase>
  );
});
