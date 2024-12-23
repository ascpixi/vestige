import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiVoiceprintFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { AudioGenerator, NoteEvent, InstrumentNodeData, NOTE_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, AudioDestination } from "../graph";
import { Automatable } from "../parameters";
import { NodeDataSerializer } from "../serializer";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SelectField } from "../components/SelectField";
import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

import HARP_DATA from "../../public/samples/harp/data.json";
import PIANO_DATA from "../../public/samples/piano/data.json";
import VIOLIN_SUS_DATA from "../../public/samples/violin-sustained/data.json";

/**
 * Represents the types of all built-in sample sets.
 */
// This should be updated as new sample sets get added.
export type KnownSampleSet =
  "PIANO" |
  "HARP" |
  "VIOLIN_SUS";

function getSamplerOptions(data: any, name: string) {
  return {
    urls: data,
    baseUrl: `/samples/${name}/`,
    release: 2
  };
}

const SAMPLE_SETS: { [key in KnownSampleSet]: Partial<tone.SamplerOptions> } = {
  "HARP": getSamplerOptions(HARP_DATA, "harp"),
  "PIANO": getSamplerOptions(PIANO_DATA, "piano"),
  "VIOLIN_SUS": getSamplerOptions(VIOLIN_SUS_DATA, "violin-sustained")
};

export class SamplerNodeData extends InstrumentNodeData {
  generator: SamplerAudioGenerator = new SamplerAudioGenerator();
  parameters: Record<string, Automatable> = {};
};

export class SamplerAudioGenerator implements AudioGenerator {
  sampler: tone.Sampler = new tone.Sampler(SAMPLE_SETS["PIANO"]);
  out: tone.Gain = new tone.Gain();
  awaiting: NoteEvent[] = [];

  private _set: KnownSampleSet = "PIANO";

  get set() { return this._set; }
  set set(value: KnownSampleSet) {
    this._set = value;

    this.sampler.disconnect();
    this.sampler.dispose();

    this.sampler = new tone.Sampler({
      ...SAMPLE_SETS[value],
      attack: this.sampler.attack,
      release: this.sampler.release
    });

    this.sampler.connect(this.out);
  }

  constructor () {
    this.sampler.connect(this.out);
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.out);
  }

  disconnect() {
    this.out.disconnect();
  }

  dispose() {
    this.disconnect();
    this.out.dispose();
    this.sampler.dispose();
  }

  accept(events: NoteEvent[]): void {
    if (!this.sampler.loaded) {
      console.warn("Attempted to play notes on a sampler while its samples are not loaded - queueing", events);
      this.awaiting.push(...events);
      return;
    }

    let mergedEvents: NoteEvent[];

    if (this.awaiting.length != 0) {
      mergedEvents = [];

      for (const event of [...this.awaiting, ...events]) {
        if (mergedEvents.some(x => x.pitch == event.pitch && x.type == event.type))
          continue; // already registered - equivalent
  
        if (mergedEvents.some(x => x.pitch == event.pitch)) {
          // Given that we already handled the case where the types are the same,
          // this case means that this is an event where the events are the opposite
          // (NOTE_ON and NOTE_OFF). Remove the other event and don't add this one.
          const idx = mergedEvents.findIndex(x => x.pitch == event.pitch && x.type != event.type);
          mergedEvents.splice(idx, 1);
          continue;
        }
  
        mergedEvents.push(event);
      }

      this.awaiting = [];
    } else {
      mergedEvents = events;
    }

    for (const event of mergedEvents) {
      const freq = tone.Frequency(event.pitch, "midi").toFrequency();

      if (event.type === "NOTE_ON") {
        this.sampler.triggerAttack(freq);
      } else {
        this.sampler.triggerRelease(freq);
      }
    }
  }
}

export class SamplerNodeSerializer implements NodeDataSerializer<SamplerNodeData> {
  type = "sampler"

  serialize(obj: SamplerNodeData) {
    return {
      s: obj.generator.set,
      a: obj.generator.sampler.attack,
      r: obj.generator.sampler.release
    };
  }

  async deserialize(serialized: ReturnType<this["serialize"]>): Promise<SamplerNodeData> {
    const data = new SamplerNodeData();
    const gen = data.generator;

    gen.sampler.attack = serialized.a;
    gen.sampler.release = serialized.r;
    gen.set = serialized.s;

    return data;
  }
}

export type SamplerNode = flow.Node<SamplerNodeData, "sampler">;

/** Creates a new `SamplerNode` with a random ID. */
export const createSamplerNode = makeNodeFactory("sampler", () => new SamplerNodeData());

/** Provides a `NodeTypeDescriptor` which describes sampler nodes. */
export const SAMPLER_NODE_DESCRIPTOR = {
  displayName: "sampler",
  icon: cls => <RiVoiceprintFill className={cls}/>,
  create: createSamplerNode
} satisfies NodeTypeDescriptor;

export const SamplerNodeRenderer = memo(function SamplerNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<SamplerNodeData>>
) {
  const [sampleSet, setSampleSet] = useState<KnownSampleSet>(data.generator.set);
  const [attack, setAttack] = useState<number>(tone.Time(data.generator.sampler.attack).toSeconds());
  const [release, setRelease] = useState<number>(tone.Time(data.generator.sampler.release).toSeconds());

  useEffect(() => {
    data.generator.set = sampleSet;
  }, [data.generator, sampleSet]);

  useEffect(() => {
    data.generator.sampler.attack = attack;
  }, [data.generator, attack]);

  useEffect(() => {
    data.generator.sampler.release = release;
  }, [data.generator, release]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.generator.dispose()}
      name="sampler"
      help={<>
        The <b>sampler</b> module can emulate any kind of instrument - it takes in
        ready sets of <b>samples</b> (audio recordings), and plays them with different
        pitches. Samplers are usually used for non-synthesized instruments like pianos,
        guitars, or strings.
      </>}
    >
      <div className="flex flex-col gap-6 w-full">
        <NodePort nodeId={id} handleId={NOTE_INPUT_HID_MAIN} kind="input" type="notes">
          <PlainField
            name="main input"
            description="the notes to play with the sampler"
          />
        </NodePort>

        <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
          <PlainField align="right"
            name="main output"
            description="the audio coming out of the sampler"
          />
        </NodePort>

        <SelectField
          name="preset"
          description="the samples the sampler should play"
          value={sampleSet}
          onChange={x => setSampleSet(x as KnownSampleSet)}
        >
          <option value="PIANO">piano</option>
          <option value="HARP">harp</option>
          <option value="VIOLIN_SUS">violin (sustained)</option>
        </SelectField>

        <SliderField
          name="attack duration"
          description="for how long notes should fade in"
          min={0} max={6} value={attack} step={0.01}
          onChange={setAttack}
          valueStringifier={x => `${x.toFixed(2)} s`}
        />

        <SliderField
          name="release duration"
          description="for how long notes should fade out"
          min={0} max={6} value={release} step={0.01}
          onChange={setRelease}
          valueStringifier={x => `${x.toFixed(2)} s`}
        />
      </div>
    </VestigeNodeBase>
  );
});
