import * as tone from "tone";
import * as flow from "@xyflow/react";
import React, { memo, useEffect, useRef, useState } from "react";
import { RiFileMusicFill, RiFolderOpenLine } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { Automatable, GAIN_UNIT, AudioDestination, AudioGenerator, InstrumentNodeData, NoteEvent, paramHandleId, SIGNAL_OUTPUT_HID } from "../../graph";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState } from "../../hooks";
import { formatGain } from "../../audioUtil";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SliderField } from "../../components/SliderField";
import { CheckboxField } from "../../components/CheckboxField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { clearViz, hLine, LABEL_HEIGHT, LABEL_MARGIN, VIZ_COLORS, VizCanvas, vizLabel, vLine } from "../../components/viz/VizCanvas";

/** The amount of sections that the waveform of an audio file is divided into. */
const PEAK_RESOLUTION = 1024;

/** The portion of the height of the overview that the loudest sample takes up. */
const WAVEFORM_SCALE = 0.9;

/** The highest gain that can be set by the user. */
const MAX_GAIN = 2;

const percentageToGain = (x: number) => (x / 100) * MAX_GAIN;
const gainToPercentage = (x: number) => (x / MAX_GAIN) * 100;

export class AudioPlayerNodeData extends InstrumentNodeData {
  generator: AudioPlayerGenerator = new AudioPlayerGenerator();
  parameters = {
    "param-volume": new Automatable(x => this.generator.out.gain.value = x * MAX_GAIN, GAIN_UNIT)
  };

  async beforeRender() {
    await this.generator.loadPromise;
  }

  onTick(_: number) {
    this.generator.startIfNeeded();
  }

  onPlaybackStop() {
    this.generator.stop();
  }
};

export class AudioPlayerGenerator implements AudioGenerator {
  player: tone.Player = new tone.Player();
  out: tone.Gain = new tone.Gain(1);
  loadPromise?: Promise<void>;

  /** The raw, encoded contents of the audio file. */
  fileData: Uint8Array | null = null;
  fileName: string = "";

  /** The minimum and maximum sample values for evenly spaced sections of the audio file. */
  peaks: { min: Float32Array, max: Float32Array } | null = null;

  /** The context time at which playback started, or `null` if the player is stopped. */
  startedAt: number | null = null;

  constructor() {
    this.player.connect(this.out);
  }

  get loop() { return this.player.loop; }
  set loop(value: boolean) {
    this.player.loop = value;
  }

  get playbackRate() { return this.player.playbackRate; }
  set playbackRate(value: number) {
    this.player.playbackRate = value;
  }

  /** Gets the current playback position, in seconds, or `null` if the player is stopped. */
  get position() {
    if (this.startedAt == null || !this.player.loaded)
      return null;

    const duration = this.player.buffer.duration;
    const elapsed = (this.player.context.now() - this.startedAt) * this.player.playbackRate;

    if (this.loop)
      return elapsed % duration;

    return elapsed < duration ? elapsed : null;
  }

  /** Replaces the audio file played by this generator. */
  setFile(data: Uint8Array | null, name: string) {
    this.stop();

    this.fileData = data;
    this.fileName = name;
    this.peaks = null;

    if (!data) {
      this.loadPromise = undefined;
      return;
    }

    this.loadPromise = (async () => {
      // `decodeAudioData` detaches the buffer it is given. We still need the data in order to
      // save the project, so we pass in a copy.
      const decoded = await this.player.context.decodeAudioData(data.slice().buffer);
      this.player.buffer = new tone.ToneAudioBuffer(decoded);
      this.peaks = computePeaks(decoded);
    })();
  }

  startIfNeeded() {
    if (this.startedAt != null || !this.player.loaded)
      return;

    this.player.start();
    this.startedAt = this.player.context.now();
  }

  stop() {
    if (this.startedAt != null && this.player.loaded) {
      this.player.stop();
    }

    this.startedAt = null;
  }

  connectTo(dst: AudioDestination): void {
    dst.accept(this.out);
  }

  disconnect() {
    this.out.disconnect();
  }

  dispose() {
    this.disconnect();
    this.player.dispose();
    this.out.dispose();
  }

  accept(_: NoteEvent[]): void {
    throw new Error("Audio player nodes do not accept note inputs.");
  }
}

/**
 * Finds the lowest and highest samples of `PEAK_RESOLUTION` evenly spaced sections of the
 * given buffer.
 */
function computePeaks(buffer: AudioBuffer) {
  const min = new Float32Array(PEAK_RESOLUTION).fill(0);
  const max = new Float32Array(PEAK_RESOLUTION).fill(0);
  const blockSize = Math.max(1, Math.floor(buffer.length / PEAK_RESOLUTION));

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);

    for (let i = 0; i < PEAK_RESOLUTION; i++) {
      const start = i * blockSize;
      const end = Math.min(data.length, start + blockSize);

      for (let j = start; j < end; j++) {
        min[i] = Math.min(min[i], data[j]);
        max[i] = Math.max(max[i], data[j]);
      }
    }
  }

  return { min, max };
}

export class AudioPlayerNodeSerializer extends FlatNodeDataSerializer<AudioPlayerNodeData> {
  type = "audio-player";
  dataFactory = () => new AudioPlayerNodeData();

  spec = {
    pv: this.prop(self => self.parameters["param-volume"]).with("controlledBy"),
    v: this.prop(self => self.generator.out.gain).with("value"),
    l: this.prop(self => self.generator).with("loop"),
    r: this.prop(self => self.generator).with("playbackRate"),
    f: {
      get: (self: AudioPlayerNodeData) => ({
        n: self.generator.fileName,
        d: self.generator.fileData
      }),
      set: (self: AudioPlayerNodeData, file: { n: string, d: Uint8Array | null }) => {
        self.generator.setFile(file.d, file.n);
      }
    }
  };
}

export type AudioPlayerNode = flow.Node<AudioPlayerNodeData, "audio-player">;

/** Creates a new `AudioPlayerNode` with a random ID. */
export const createAudioPlayerNode = makeNodeFactory("audio-player", () => new AudioPlayerNodeData());

/** Provides a `NodeTypeDescriptor` which describes audio player nodes. */
export const AUDIO_PLAYER_NODE_DESCRIPTOR = {
  displayName: "Audio Player",
  icon: cls => <RiFileMusicFill className={cls}/>,
  help: <>
    The <b>audio player</b> node plays an audio file, starting from the beginning whenever playback
    is started. The file is saved together with the project, so large files will make
    the project (and links to it) larger as well.
  </>,
  create: createAudioPlayerNode
} satisfies NodeTypeDescriptor;

/** Formats an amount of seconds in the form of `m:ss`. */
function formatTime(seconds: number) {
  const wholeMinutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${wholeMinutes}:${wholeSeconds.toString().padStart(2, "0")}`;
}

/** Displays an overview of the waveform of the loaded file, with a playhead. */
function WaveformOverview({ gen }: { gen: AudioPlayerGenerator }) {
  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    clearViz(ctx, width, height);
    hLine(ctx, height / 2, width);

    const peaks = gen.peaks;
    if (!peaks) {
      vizLabel(
        ctx,
        gen.fileData ? "loading..." : "no file",
        width / 2,
        (height - LABEL_HEIGHT) / 2,
        "center"
      );

      return;
    }

    const duration = gen.player.buffer.duration;
    const position = gen.position;
    const playheadX = position == null ? -1 : (position / duration) * width;
    const mid = height / 2;
    const scale = mid * WAVEFORM_SCALE;

    for (let x = 0; x < width; x++) {
      const from = Math.floor((x / width) * PEAK_RESOLUTION);
      const to = Math.max(from + 1, Math.floor(((x + 1) / width) * PEAK_RESOLUTION));

      let min = 0;
      let max = 0;

      for (let i = from; i < to; i++) {
        min = Math.min(min, peaks.min[i]);
        max = Math.max(max, peaks.max[i]);
      }

      ctx.fillStyle = x <= playheadX ? VIZ_COLORS.primary : VIZ_COLORS.primarySoft;
      ctx.fillRect(
        x,
        mid - max * scale,
        1,
        Math.max(1, (max - min) * scale)
      );
    }

    if (playheadX >= 0) {
      vLine(ctx, playheadX, height, VIZ_COLORS.primary);
    }

    vizLabel(
      ctx,
      `${formatTime(position ?? 0)} / ${formatTime(duration)}`,
      width - LABEL_MARGIN,
      LABEL_MARGIN,
      "right"
    );
  }

  return <VizCanvas draw={draw} height={72} />;
}

export const AudioPlayerNodeRenderer = memo(function AudioPlayerNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<AudioPlayerNodeData>>
) {
  const gen = data.generator;

  const [fileName, setFileName] = useState(gen.fileName);
  const [loop, setLoop] = useBoundState(gen, "loop");
  const [rate, setRate] = useBoundState(gen, "playbackRate");
  const [volume, setVolume] = useState(gainToPercentage(gen.out.gain.value));
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data.parameters["param-volume"].isAutomated()) {
      gen.out.gain.value = percentageToGain(volume);
    }
  }, [data, gen, volume]);

  async function loadFile(file: File) {
    setError(null);
    gen.setFile(new Uint8Array(await file.arrayBuffer()), file.name);
    setFileName(file.name);

    try {
      await gen.loadPromise;
    }
    catch (err) {
      console.error("The audio file could not be decoded.", err);
      gen.setFile(null, "");
      setFileName("");
      setError("This file could not be decoded. Try a WAV, MP3, OGG or FLAC file.");
    }
  }

  function handleDragOver(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    setDragOver(true);
  }

  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    setDragOver(false);

    const file = ev.dataTransfer.files[0];
    if (file) {
      loadFile(file);
    }
  }

  function handleFileChoose(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (file) {
      loadFile(file);
    }

    ev.target.value = "";
  }

  return (
    <VestigeNodeBase
      id={id} onRemove={() => gen.dispose()}
      name="Audio Player"
      help={AUDIO_PLAYER_NODE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6 w-full">
        <NodePort nodeId={id} handleId={SIGNAL_OUTPUT_HID} kind="output" type="signal">
          <PlainField align="right" name="output" />
        </NodePort>

        <div
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col gap-2 rounded-md transition-shadow ${dragOver ? "ring-2 ring-primary" : ""}`}
        >
          <WaveformOverview gen={gen} />

          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => fileInputRef.current!.click()}
            >
              <RiFolderOpenLine className="w-4 h-4"/>
              { fileName ? "Replace" : "Open file" }
            </button>

            <span className="truncate text-gray-500" title={fileName}>
              { fileName || "or drop an audio file here" }
            </span>
          </div>

          { !error ? <></> : <span className="text-error">{error}</span> }

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChoose}
          />
        </div>

        <NodePort nodeId={id} handleId={paramHandleId("volume")} kind="input" type="value">
          <SliderField
            name="gain"
            min={0} max={100} value={volume}
            valueStringifier={x => formatGain(percentageToGain(x))}
            valueParser={x => gainToPercentage(tone.dbToGain(x))}
            onChange={setVolume}
            automatable={data.parameters["param-volume"]}
            automatableDisplay={() => gainToPercentage(gen.out.gain.value)}
          />
        </NodePort>

        <SliderField
          name="speed"
          min={0.25} max={4} value={rate} step={0.01}
          valueStringifier={x => `${x.toFixed(2)}x`}
          onChange={setRate}
        />

        <CheckboxField name="loop" value={loop} onChange={setLoop} />
      </div>
    </VestigeNodeBase>
  );
});
