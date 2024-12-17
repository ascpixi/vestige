import { memo, useEffect, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import * as tone from "tone";

import { VestigeNodeBase } from "../components/VestigeNodeBase";
import { SelectField } from "../components/SelectField";
import { SliderField } from "../components/SliderField";

import { AudioGenerator, NoteEvent, InstrumentNodeData, NOTE_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, AudioDestination, paramHandleId } from "../graph";
import { octToCents } from "../audioUtil";
import { makeNodeFactory, NodeTypeDescriptor } from ".";
import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { RiVolumeVibrateFill } from "@remixicon/react";
import { Automatable } from "../parameters";
import { NodeDataSerializer } from "../serializer";
import { lerp, match } from "../util";

type Countour = "pluck" | "smooth" | "sudden";
type Waveform = "square" | "sawtooth" | "sine";

export class SynthNodeData extends InstrumentNodeData {
  generator: SynthAudioGenerator;
  octave: number = 0;
  fineTune: number = 0;
  contour: Countour = "pluck";
  countourAmt: number = 0.5;
  parameters: {
    "param-fineTune": Automatable
  } & Record<string, Automatable>

  applyContour() {
    const x = this.countourAmt;

    let env = match<Countour, Omit<tone.EnvelopeOptions, "context">>(this.contour, {
      "pluck": {
        attack: 1 / 1000, // 1ms, just to prevent clicks
        attackCurve: "linear",
        decay: lerp(170, 3000, x) / 1000,
        decayCurve: "exponential",
        sustain: 0, // 0%
        release: lerp(170, 3000, x) / 1000 / 2, // half of the decay time
        releaseCurve: "exponential"
      },
      "smooth": {
        attack: lerp(200, 4000, x) / 1000,
        attackCurve: "exponential",
        decay: 0,
        decayCurve: "linear",
        sustain: 1, // 100%
        release: lerp(200, 4000, x) / 1000 * 1.5, // 150% of the attack time
        releaseCurve: "exponential"
      },
      "sudden": {
        attack: 0.5 / 1000, // 0.5ms
        attackCurve: "linear",
        decay: 0,
        decayCurve: "linear",
        release: 15 / 1000, // 15ms
        releaseCurve: "linear",
        sustain: 1 // 100%
      }
    });

    this.generator.synth.set({ envelope: env });
  }

  constructor () {
    super();

    this.generator = new SynthAudioGenerator();

    const synth = this.generator.synth;
    this.parameters = {
      "param-fineTune": new Automatable(x => synth.set({ detune: (this.octave * 1200) + ((x * 200) - 100) }))
    }
  }
};

export class SynthAudioGenerator implements AudioGenerator {
  synth: tone.PolySynth;

  constructor() {
    this.synth = new tone.PolySynth(tone.Synth, {
      oscillator: {
        type: "sine"
      }
    });
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.synth);
  }

  disconnect() {
    this.synth.disconnect();
  }

  dispose() {
    this.disconnect();
    this.synth.dispose();
  }

  accept(events: NoteEvent[]): void {
    for (const event of events) {
      const freq = tone.Frequency(event.pitch, "midi").toFrequency();

      if (event.type === "NOTE_ON") {
        this.synth.triggerAttack(freq);
      } else {
        this.synth.triggerRelease(freq);
      }
    }
  }
}

export class SynthNodeSerializer implements NodeDataSerializer<SynthNodeData> {
  type = "synth"

  serialize(obj: SynthNodeData) {
    const synth = obj.generator.synth;
    const params = obj.parameters;

    return {
      pf: params["param-fineTune"].controlledBy,
      c: obj.contour,
      a: obj.countourAmt,
      o: obj.octave,
      f: obj.fineTune,
      w: synth.get().oscillator.type,
      v: synth.volume.value
    };
  }

  deserialize(serialized: ReturnType<this["serialize"]>): SynthNodeData {
    const data = new SynthNodeData();
    const synth = data.generator.synth;
    const params = data.parameters;

    params["param-fineTune"].controlledBy = serialized.pf;
    data.octave = serialized.o;
    data.fineTune = serialized.f;
    data.contour = serialized.c;
    data.countourAmt = serialized.a;
    synth.volume.value = serialized.v;

    synth.set({ oscillator: { type: serialized.w as any } });
    data.applyContour();

    return data;
  }
}

export type SynthNode = Node<SynthNodeData, "synth">;

/** Creates a new `SynthNode` with a random ID. */
export const createSynthNode = makeNodeFactory("synth", () => new SynthNodeData());

/** Provides a `NodeTypeDescriptor` which describes synth nodes. */
export const SYNTH_NODE_DESCRIPTOR = {
  displayName: "synth",
  icon: cls => <RiVolumeVibrateFill className={cls}/>,
  create: createSynthNode
} satisfies NodeTypeDescriptor;

export const SynthNodeRenderer = memo(function SynthNodeRenderer(
  { id, data }: NodeProps<Node<SynthNodeData>>
) {
  const [countour, setCountour] = useState<Countour>(data.contour);
  const [countourAmt, setCountourAmt] = useState<number>(data.countourAmt * 100);

  const [waveform, setWaveform] = useState<Waveform>(data.generator.synth.get().oscillator.type as Waveform);
  const [fineTune, setFineTune] = useState(data.fineTune);
  const [octave, setOctave] = useState(data.octave);
  const [volume, setVolume] = useState(tone.dbToGain(data.generator.synth.volume.value) * 100);

  useEffect(() => {
    data.generator.synth.set({
      oscillator: {
        type: waveform
      }
    });
  }, [data.generator, waveform]);

  useEffect(() => {
    data.generator.synth.volume.value = tone.gainToDb(volume / 100);
  }, [data.generator, volume]);

  useEffect(() => {
    data.fineTune = fineTune;
    data.octave = octave;
    data.generator.synth.set({ detune: octToCents(octave + 1) + fineTune });
  }, [data, octave, fineTune]);

  useEffect(() => {
    data.contour = countour;
    data.countourAmt = countourAmt / 100;
    data.applyContour();
  }, [data, countour, countourAmt]);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => data.generator.dispose()}
      name="synth"
      help={<>
        The <b>synth</b> module takes in notes, and outputs audio - more specifically,
        an <b>audio signal</b>. The timbre of the synth is specified by its <b>shape</b>
        (waveform). The countour of the final audio (plucky, smooth, etc...) is controlled
        by the <b>type</b>.

        <br/><br/>
        
        Try combining multiple synths for more interesting textures! It helps to change
        the fine-tune between multiple synths to keep it from sounding bland.
      </>}
    >
      <div>
        <div className="flex flex-col gap-6">
          <NodePort offset={20} handleId={NOTE_INPUT_HID_MAIN} kind="input" type="notes">
            <PlainField
              name="main input"
              description="the notes to hold down on the synthesizer"
            />
          </NodePort>

          <NodePort offset={80} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
            <PlainField align="right"
              name="main output"
              description="the audio coming out of the synthesizer"
            />
          </NodePort>

          <SelectField
            name="type"
            description="the audio countour of the synthesizer"
            value={countour}
            onChange={x => setCountour(x as Countour)}
          >
            <option>pluck</option>
            <option>smooth</option>
            <option>sudden</option>
          </SelectField>

          {!["pluck", "smooth"].includes(countour) ? <></>
            : (
              <SliderField
                name={countour == "pluck" ? "pluckiness" : "fade"}
                description={
                  countour == "pluck"
                    ? "how plucky the synth is. higher values = longer plucks"
                    : "how long the synth swells in and out"
                }
                min={0} max={100} value={countourAmt} isPercentage
                onChange={setCountourAmt}
              />
            )
          }

          <SelectField
            name="shape"
            description="the shape of the oscillator, affects its timbre. see help for info."
            value={waveform}
            onChange={x => setWaveform(x as Waveform)}
          >
            <option>square</option>
            <option>sawtooth</option>
            <option>sine</option>
          </SelectField>

          <SliderField
            name="octave"
            description="the large pitch offset of the oscillator. negative values pitch it down, positive pitch it up."
            min={-3} max={3} value={octave}
            onChange={setOctave}
          />

          <NodePort offset={540} handleId={paramHandleId("fineTune")} kind="input" type="value">
            <SliderField
              name="fine-tune"
              description="the tiny pitch offset of the oscillator. useful for detuning. negative values pitch it down, positive pitch it up."
              min={-100} max={100} value={fineTune} isPercentage
              onChange={setFineTune}
              automatable={data.parameters["param-fineTune"]}
              automatableDisplay={() => data.generator.synth.get().detune - (octave * 1200)}
            />
          </NodePort>

          <SliderField
            name="volume"
            description="the volume (mix) of the oscillator"
            min={0} max={100} value={volume} isPercentage
            onChange={setVolume}
          />
        </div>
      </div>
    </VestigeNodeBase>
  );
});
