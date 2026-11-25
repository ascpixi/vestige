import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useEffect, useRef, useState } from "react";
import { RiEqualizerFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { Automatable, AudioDestination, ParameterUnit, AudioEffect, EffectNodeData, paramHandleId, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, unaryAudioDestination } from "../../graph";
import { assert, invLogLerp, logLerp, range } from "../../util";
import { toneFreq } from "../../audioUtil";
import { FlatNodeDataSerializer, FlatSerializerSpec } from "../../serializer";
import { useBoundState } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SelectField } from "../../components/SelectField";
import { SliderField } from "../../components/SliderField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { clearViz, drawDot, drawFreqGrid, freqToX, hLine, LABEL_HEIGHT, LABEL_MARGIN, strokeCurve, VIZ_COLORS, VizCanvas, vizLabel } from "../../components/viz/VizCanvas";
import { drawSpectrum, makeSpectrumBuffer, useAnalyser } from "../../components/viz/AudioScope";

type FilterType = "lowpass" | "bandpass" | "highpass" | "notch";

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
      "param-cutoff": new Automatable(x => flt.frequency.value = cutoffScalarToHz(x), CUTOFF_UNIT),
      "param-resonance": new Automatable(x => flt.Q.value = scalarToResonance(x), RESONANCE_UNIT)
    };
  }
};

export class FilterAudioEffect implements AudioEffect {
  filter: tone.Filter = new tone.Filter({
    frequency: cutoffScalarToHz(0.5),
    Q: scalarToResonance(0.5),
    rolloff: -24,
    type: "lowpass"
  });

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
}

export class FilterNodeSerializer extends FlatNodeDataSerializer<FilterNodeData> {
  type = "filter";
  dataFactory = () => new FilterNodeData();

  spec: FlatSerializerSpec<FilterNodeData> = {
    pc: this.prop(self => self.parameters["param-cutoff"]).with("controlledBy"),
    pq: this.prop(self => self.parameters["param-resonance"]).with("controlledBy"),
    q: this.prop(self => self.effect.filter.Q).with("value"),
    r: this.prop(self => self.effect.filter).with("rolloff"),
    c: {
      get: (self) => tone.Frequency(self.effect.filter.frequency.value).toFrequency(),
      set: (self, x) => self.effect.filter.frequency.value = x
    }
  }
}

export type FilterNode = flow.Node<FilterNodeData, "filter">

/** Creates a new `FilterNode` with a random ID. */
export const createFilterNode = makeNodeFactory("filter", () => new FilterNodeData());

/** Provides a `NodeTypeDescriptor` which describes filter nodes. */
export const FILTER_NODE_DESCRIPTOR = {
  displayName: "Filter",
  icon: cls => <RiEqualizerFill className={cls}/>,
  help: <>
    <p>
      The <b>filter</b> node removes certain frequencies, and attenuates others - for example,
      the low-pass filter will muffle the sound, depending on the <b>cutoff</b>. Automating the
      cutoff with an <b>LFO</b> or a <b>Noise</b> node can introduce some movement into
      your composition!
    </p>

    <p>
      The <b>slope</b> determines how steeply the frequencies past the cutoff are attenuated,
      and the <b>resonance</b> emphasizes the frequencies around it.
    </p>
  </>,
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

const CUTOFF_UNIT: ParameterUnit = {
  format: x => `${Math.round(cutoffScalarToHz(x))} Hz`,
  parse: hzToCutoffScalar
};

const RESONANCE_UNIT: ParameterUnit = {
  format: x => `Q ${scalarToResonance(x).toFixed(2)}`,
  parse: resonanceToScalar
};

/** All available slopes, in dB per octave. */
const ROLLOFFS: tone.FilterRollOff[] = [-12, -24, -48, -96];

const RESPONSE_POINTS = 256;
const RESPONSE_MIN_DB = -36;
const RESPONSE_MAX_DB = 18;

/** The lowest frequency of the cutoff and the response graph, in Hz. */
const MIN_FREQ = 20;

/** The highest frequency of the cutoff and the response graph, in Hz. */
const MAX_FREQ = 22_000;

/** The lowest gain that the response is calculated for, as silence is infinitely low in dB. */
const MIN_RESPONSE_GAIN = 1e-6;

/**
 * Draws the magnitude response of the given filter, on top of the spectra of the
 * audio going in and out of it.
 */
function FilterResponse({ filter }: { filter: tone.Filter }) {
  const lastKey = useRef("");
  const biquad = useRef<BiquadFilterNode | null>(null);
  const curve = useRef<Path2D | null>(null);

  const maintainInput = useAnalyser(filter.input as tone.ToneAudioNode);
  const maintainOutput = useAnalyser(filter);
  const inputBuffer = useRef(makeSpectrumBuffer());
  const outputBuffer = useRef(makeSpectrumBuffer());

  const frequencies = useRef(
    Float32Array.from(range(RESPONSE_POINTS), i => cutoffScalarToHz(i / (RESPONSE_POINTS - 1)))
  );

  const magnitudes = useRef(new Float32Array(RESPONSE_POINTS));
  const phases = useRef(new Float32Array(RESPONSE_POINTS));

  function hzToX(hz: number, width: number) {
    return freqToX(hz, width, MIN_FREQ, MAX_FREQ);
  }

  function dbToY(db: number, height: number) {
    return height - ((db - RESPONSE_MIN_DB) / (RESPONSE_MAX_DB - RESPONSE_MIN_DB)) * height;
  }

  /** Re-calculates the response curve if any of the parameters of the filter changed. */
  function updateCurve(width: number, height: number) {
    const cutoff = toneFreq(filter.frequency.value);
    const key = `${filter.type}/${cutoff}/${filter.Q.value}/${filter.rolloff}/${width}/${height}`;

    if (key == lastKey.current && curve.current)
      return curve.current;

    lastKey.current = key;
    biquad.current ??= filter.context.createBiquadFilter();

    const response = biquad.current;
    response.type = filter.type;
    response.frequency.value = cutoff;
    response.Q.value = filter.Q.value;
    response.getFrequencyResponse(frequencies.current, magnitudes.current, phases.current);

    const stages = ROLLOFFS.indexOf(filter.rolloff) + 1;
    const path = new Path2D();

    for (let i = 0; i < RESPONSE_POINTS; i++) {
      const gain = Math.max(MIN_RESPONSE_GAIN, magnitudes.current[i]);

      // We let the curve go slightly below the graph, so that it doesn't end abruptly.
      const level = Math.max(RESPONSE_MIN_DB - 6, tone.gainToDb(gain) * stages);

      path.lineTo(hzToX(frequencies.current[i], width), dbToY(level, height));
    }

    curve.current = path;
    return path;
  }

  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const path = updateCurve(width, height);
    const input = maintainInput();
    const output = maintainOutput();

    clearViz(ctx, width, height);
    drawFreqGrid(ctx, width, height);

    if (input) {
      drawSpectrum(
        ctx,
        input,
        inputBuffer.current,
        width,
        height,
        VIZ_COLORS.muted
      );
    }

    if (output) {
      drawSpectrum(
        ctx,
        output,
        outputBuffer.current,
        width,
        height,
        VIZ_COLORS.primaryFaint
      );
    }

    const unityY = dbToY(0, height);
    hLine(ctx, unityY, width, VIZ_COLORS.muted);
    vizLabel(ctx, "0 dB", LABEL_MARGIN, unityY - LABEL_HEIGHT);

    strokeCurve(ctx, path);
    drawDot(ctx, hzToX(toneFreq(filter.frequency.value), width), unityY);
  }

  return <VizCanvas draw={draw} height={112} />;
}

export const FilterNodeRenderer = memo(function FilterNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<FilterNodeData>>
) {
  const filter = data.effect.filter;

  const [type, setType] = useBoundState(filter, "type");
  const [rolloff, setRolloff] = useBoundState(filter, "rolloff");

  const [cutoff, setCutoff] = useState(hzToCutoffScalar(tone.Frequency(filter.frequency.value).toFrequency()) * 100);
  const [resonance, setResonance] = useState(resonanceToScalar(filter.Q.value) * 100);

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
      name="Filter"
      help={FILTER_NODE_DESCRIPTOR.help}
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

        <FilterResponse filter={filter} />

        <div className="grid grid-cols-2 gap-4">
          <SelectField
            name="type"
            value={type}
            onChange={x => setType(x as FilterType)}
          >
            <option value="lowpass">low-pass</option>
            <option value="highpass">high-pass</option>
            <option value="bandpass">band-pass</option>
            <option value="notch">notch</option>
          </SelectField>

          <SelectField
            name="slope"
            value={rolloff}
            onChange={x => setRolloff(parseInt(x) as tone.FilterRollOff)}
          >
            { ROLLOFFS.map(x => <option key={x} value={x}>{-x} dB/oct</option>) }
          </SelectField>
        </div>

        <NodePort nodeId={id} handleId={paramHandleId("cutoff")} kind="input" type="value">
          <SliderField
            name="cutoff"
            min={0} max={100} value={cutoff} step={0.01}
            valueStringifier={x => `${Math.round(cutoffScalarToHz(x / 100))} Hz`}
            valueParser={x => hzToCutoffScalar(x) * 100}
            onChange={setCutoff}
            automatable={data.parameters["param-cutoff"]}
            automatableDisplay={() => hzToCutoffScalar(toneFreq(filter.frequency.value)) * 100}
          />
        </NodePort>

        <NodePort nodeId={id} handleId={paramHandleId("resonance")} kind="input" type="value">
          <SliderField
            name="resonance"
            min={0} max={100} value={resonance} step={0.1}
            valueStringifier={x => `Q ${scalarToResonance(x / 100).toFixed(2)}`}
            valueParser={x => resonanceToScalar(x) * 100}
            onChange={setResonance}
            automatable={data.parameters["param-resonance"]}
            automatableDisplay={() => resonanceToScalar(filter.Q.value) * 100}
          />
        </NodePort>
      </div>
    </VestigeNodeBase>
  );
});
