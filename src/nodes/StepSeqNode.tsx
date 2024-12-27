import * as tone from "tone";
import * as flow from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { RiAddFill, RiDeleteBinFill, RiGridFill } from "@remixicon/react";

import type { NodeTypeDescriptor } from ".";
import { makeNodeFactory } from "./basis";
import { AudioGenerator, NoteEvent, InstrumentNodeData, SIGNAL_OUTPUT_HID, AudioDestination, paramHandleId } from "../graph";
import { Automatable } from "../parameters";
import { FlatNodeDataSerializer, FlatSerializerSpec } from "../serializer";
import { useBoundState } from "../hooks";

import { NodePort } from "../components/NodePort";
import { PlainField } from "../components/PlainField";
import { SliderField } from "../components/SliderField";
import { VestigeNodeBase } from "../components/VestigeNodeBase";

import { ONE_SHOT_BASE_URL, ONE_SHOT_SAMPLE_IDS, ONE_SHOT_SAMPLES, OneShotSampleId } from "../assets/oneshots";
import { assert, changeOne, lerp, range, removeOne } from "../util";
import { CheckboxField } from "../components/CheckboxField";

const MIN_BPM = 40;
const MAX_BPM = 220;

interface StepSeqTrack {
  steps: boolean[];
  sample: OneShotSampleId;
}

export class StepSeqNodeData extends InstrumentNodeData {
  generator: StepSeqAudioGenerator = new StepSeqAudioGenerator();
  parameters = {
    "param-bpm": new Automatable(x => this.generator.bpm = lerp(MIN_BPM, MAX_BPM, x)),
    "param-volume": new Automatable(x => this.generator.players.volume.value = x)
  };

  async beforeRender() {
    if (this.generator.players.loaded || !this.generator.loadPromise)
      return;

    await this.generator.loadPromise;
  }

  onTick(time: number) {
    this.generator.onTick(time);
  }
};

export class StepSeqAudioGenerator implements AudioGenerator {
  players: tone.Players = new tone.Players();

  bpm: number = 120;
  awaiting: NoteEvent[] = [];
  loadPromise?: Promise<void>;
  lastStepIdx: number = 0;
  lastStepTime: number = 0;
  shouldSync: boolean = false;

  private _tracks: StepSeqTrack[] = [];

  /**
   * Gets the current sequencer tracks.
   */
  get tracks() { return this._tracks; }

  /**
   * Sets all sequencer tracks. Please note that this property shouldn't be called often.
   * Prefer `addTrack`, `removeTrack`, and `clearTracks` when applicable.
   */
  set tracks(value: StepSeqTrack[]) {
    this._tracks = value;
    this.createNewPlayers();
  }

  private createNewPlayers(): asserts this is { players: tone.Players, loadPromise: Promise<void> } {
    let volume = 1;

    if (this.players) {
      volume = this.players.volume.value;
      this.players.disconnect();
      this.players.dispose();
    }

    this.loadPromise = new Promise(resolve => {
      this.players = new tone.Players(
        Object.fromEntries(this.tracks.map(x => [x.sample, `${ONE_SHOT_BASE_URL}/${x.sample}.wav`])),
        {
          onload: resolve,
          volume: volume
        }
      );
    });
  }

  onTick(time: number) {
    if (!this.players.loaded)
      return;

    const stepDuration = ((60 / this.bpm) / 4);

    let stepIdx: number;
    if (this.shouldSync) {
      // If we should synchronize with the global timer, we calculate the step index
      // based on the provided time, and assume a step change once `lastStepIdx` is different.
      //
      // I tried a time-based approach like in the non-sync case, but we often dropped certain
      // steps because of lag (either forwards or backwards in time).
      stepIdx = Math.round(time / stepDuration) % 16;

      if (this.lastStepIdx == stepIdx) {
        return;
      }
    } else {
      if (stepDuration > time - this.lastStepTime)
        return;

      stepIdx = this.lastStepIdx;
    }

    for (const track of this.tracks) {
      if (!track.steps[stepIdx])
        continue;

      this.players.player(track.sample).start();
    }

    if (this.shouldSync) {
      this.lastStepIdx = stepIdx;
    } else {
      this.lastStepIdx = (stepIdx + 1) % 16;
    }

    this.lastStepTime = time;
  }

  /** Adds a track with a random, unique sample. */
  addTrack() {
    const sample = ONE_SHOT_SAMPLE_IDS.find(x => !this._tracks.some(y => y.sample == x)) ?? this._tracks[0].sample;

    this._tracks.push({ sample, steps: range(16).map(() => false) });
    this.ensureSampleLoaded(sample);

    return this._tracks[this._tracks.length - 1];
  }

  ensureSampleLoaded(sample: OneShotSampleId) {
    if (!this.players.has(sample)) {
      this.players.add(sample, `${ONE_SHOT_BASE_URL}/${sample}.wav`);
    }
  }

  mutateTrackSteps(idx: number, steps: boolean[]) {
    this._tracks[idx].steps = steps;
  }

  mutateTrackSample(idx: number, sample: OneShotSampleId) {
    const track = this._tracks[idx];
    if (track.sample == sample)
      return;

    track.sample = sample;
    this.ensureSampleLoaded(sample);
  }

  removeTrack(idx: number) {
    this._tracks.splice(idx, 1);
  }

  clearTracks() {
    this._tracks = [];
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.players);
  }

  disconnect() {
    this.players.disconnect();
  }

  dispose() {
    this.disconnect();
    this.players.dispose();
  }

  accept(_: NoteEvent[]): void {
    throw new Error("Step sequencer nodes do not accept note inputs.");
  }
}

export class StepSeqNodeSerializer extends FlatNodeDataSerializer<StepSeqNodeData> {
  type = "step-seq";
  dataFactory = () => new StepSeqNodeData();

  spec: FlatSerializerSpec<StepSeqNodeData> = {
    pb: this.prop(self => self.parameters["param-bpm"]).with("controlledBy"),
    pv: this.prop(self => self.parameters["param-volume"]).with("controlledBy"),
    v: this.prop(self => self.generator.players.volume).with("value"),
    b: this.prop(self => self.generator).with("bpm"),
    s: this.prop(self => self.generator).with("shouldSync"),
    t: {
      // We serialize the track steps into a bit-field.
      get(self) {
        return self.generator.tracks
          .map(x => ({
            s: x.sample,
            t: (() => {
              let bitfield = 0;
              for (let i = 0; i < 16; i++) {
                if (x.steps[i]) {
                  bitfield |= (1 << i);
                }
              }

              return bitfield;
            })()
          }))
      },

      set(self, data: { s: OneShotSampleId, t: number }[]) {
        self.generator.tracks = data.map(x => ({
          sample: x.s,
          steps: (() => {
            const steps: boolean[] = [];
            for (let i = 0; i < 16; i++) {
              steps.push( (x.t & (1 << i)) == 0 ? false : true );
            }

            return steps;
          })()
        }));
      }
    }
  };
}

export type StepSeqNode = flow.Node<StepSeqNodeData, "step-seq">;

/** Creates a new `StepSeq` with a random ID. */
export const createStepSeqNode = makeNodeFactory("step-seq", () => new StepSeqNodeData());

/** Provides a `NodeTypeDescriptor` which describes step sequencer nodes. */
export const STEP_SEQ_NODE_DESCRIPTOR = {
  displayName: "step/drum sequencer",
  icon: cls => <RiGridFill className={cls}/>,
  create: createStepSeqNode
} satisfies NodeTypeDescriptor;

export const StepSeqNodeRenderer = memo(function StepSeqNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<StepSeqNodeData>>
) {
  const gen = data.generator;

  const [bpm, setBpm] = useBoundState(gen, "bpm");
  const [volume, setVolume] = useState(tone.dbToGain(gen.players.volume.value) * 100);
  const [shouldSync, setShouldSync] = useBoundState(gen, "shouldSync");

  const [trackSteps, setTrackSteps] = useState(gen.tracks.map(x => x.steps));
  const [trackSamples, setTrackSamples] = useState(gen.tracks.map(x => x.sample));

  const [activeStepIdx, setActiveStepIdx] = useState(data.generator.lastStepIdx);

  assert(trackSteps.length == trackSamples.length);
  const trackCount = trackSteps.length;

  useEffect(() => { gen.players.volume.value = tone.gainToDb(volume / 100) }, [gen, volume]);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveStepIdx(data.generator.lastStepIdx);
    }, 100);

    return () => clearInterval(id);
  }, []);

  function handleMouseDown(ev: React.MouseEvent<HTMLElement>) {
    ev.stopPropagation();
  }

  function onAddTrack() {
    const track = data.generator.addTrack();
    setTrackSteps([...trackSteps, track.steps]);
    setTrackSamples([...trackSamples, track.sample]);
  }

  function onRemoveTrack(idx: number) {
    data.generator.removeTrack(idx);
    setTrackSteps(removeOne(trackSteps, idx));
    setTrackSamples(removeOne(trackSamples, idx));
  }

  function onTrackSampleChange(idx: number, sample: OneShotSampleId) {
    assert(ONE_SHOT_SAMPLE_IDS.includes(sample));
    setTrackSamples(changeOne(trackSamples, idx, sample));
    data.generator.mutateTrackSample(idx, sample);
  }

  function onTrackStepChange(idx: number, stepIdx: number, newValue: boolean) {
    const newSteps = changeOne(trackSteps[idx], stepIdx, newValue);

    setTrackSteps(changeOne(trackSteps, idx, newSteps));
    data.generator.mutateTrackSteps(idx, newSteps);
  }

  return (
    <VestigeNodeBase
      id={id} onRemove={() => gen.dispose()}
      className="w-[650px]"
      name="step sequencer"
      help={<>
        The <b>step sequencer</b> (also called a <i>drum machine</i>) plays short
        audio clips (samples) in a pre-determined rhythm. It can play any number of
        tracks, each with different samples.
      </>}
    >
      <div className="flex flex-col gap-6 w-full">
        <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
          <PlainField align="right"
            name="main output"
            description="the audio coming out of the step sequencer"
          />
        </NodePort>

        <NodePort nodeId={id} handleId={paramHandleId("bpm")} kind="input" type="value">
          <SliderField
            name="tempo (BPM)"
            description="the tempo of the sequencer, in beats per minute"
            min={MIN_BPM} max={MAX_BPM} value={bpm}
            onChange={setBpm}
            automatable={data.parameters["param-bpm"]}
            automatableDisplay={() => data.generator.bpm}
          />
        </NodePort>

        <NodePort nodeId={id} handleId={paramHandleId("volume")} kind="input" type="value">
          <SliderField
            name="volume"
            description="the volume (gain) of all samples played by the sequencer"
            min={0} max={100} value={volume} isPercentage
            onChange={setVolume}
            automatable={data.parameters["param-volume"]}
            automatableDisplay={() => data.generator.players.volume.value}
          />
        </NodePort>

        <CheckboxField
          name="synchronize"
          description="select if using multiple sequencers, deselect if dynamically changing the BPM"
          value={shouldSync}
          onChange={setShouldSync}
        />

        <PlainField name="tracks" description="individual tracks of the sequencer">
          <div className="flex flex-col gap-2">
            {
              range(trackCount).map(trackIdx => {
                const sample = trackSamples[trackIdx];
                const steps = trackSteps[trackIdx];
                  
                return (
                  <div className="flex flex-row gap-2 items-center" key={`track-${trackIdx}`}>
                    <select
                      className="select select-sm w-48"
                      value={sample}
                      onChange={ev => onTrackSampleChange(trackIdx, ev.target.value as OneShotSampleId)}
                    >
                      {
                        Object.entries(ONE_SHOT_SAMPLES).map(x =>
                          <option value={x[0]} key={`opt-${x[0]}-${trackIdx}`}>{x[1].name}</option> 
                        )
                      }
                    </select>

                    <div className="flex flex-row gap-[2px]">
                      {
                        range(16).map(i => (
                          <button
                            className={
                              `btn btn-sm px-[10px]
                              ${
                                steps[i] ? "btn-primary" :
                                activeStepIdx == i ? "btn-secondary" :
                                ""
                              }
                            `}
                            onClick={() => onTrackStepChange(trackIdx, i, !steps[i])}
                            onMouseDownCapture={handleMouseDown}
                            key={`step-${i}`}
                          />
                        ))
                      }
                    </div>

                    <div
                      className="cursor-pointer"
                      onMouseDownCapture={handleMouseDown}
                      onClick={() => onRemoveTrack(trackIdx)}
                    >
                      <RiDeleteBinFill className="w-5 h-5"/>
                    </div>
                  </div>
                );
              }
              )
            }

            <div className="w-full flex justify-center mt-2">
              <button
                title="create new track"
                className="btn btn-wide btn-sm"
                onClick={onAddTrack}
                onMouseDownCapture={handleMouseDown}
              >
                <RiAddFill/>
              </button>
            </div>
          </div>
        </PlainField>
      </div>
    </VestigeNodeBase>
  );
});
