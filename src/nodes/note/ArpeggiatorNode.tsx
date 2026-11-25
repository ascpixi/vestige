import * as flow from "@xyflow/react";
import { memo } from "react";
import { RiDice3Fill } from "@remixicon/react";

import type { NodeTypeDescriptor } from "..";
import { makeNodeFactory } from "../basis";
import { NOTE_INPUT_HID_MAIN, NOTE_OUTPUT_HID, NoteGeneratorNodeData, ParametricNoteGenerator } from "../../graph";
import { assert, match } from "../../util";
import { FlatNodeDataSerializer } from "../../serializer";
import { useBoundState, useNoteGeneratorSync, useTempoSync } from "../../hooks";

import { NodePort } from "../../components/NodePort";
import { PlainField } from "../../components/PlainField";
import { SelectField } from "../../components/SelectField";
import { VestigeNodeBase } from "../../components/VestigeNodeBase";
import { SliderField } from "../../components/SliderField";
import { clearViz, hLine, LABEL_HEIGHT, LABEL_MARGIN, VIZ_COLORS, VizCanvas, vizLabel, vLine } from "../../components/viz/VizCanvas";
import { midiToName } from "../../audioUtil";
import { DEFAULT_BPM, divisionLength } from "../../transport";
import { DivisionField, SyncToggle } from "../../components/TempoSync";

const MIN_SPEED = 0.05;
const MAX_SPEED = 2;

type Style = "UP" | "DOWN" | "RANDOM";
type NoteInputHandle = typeof NOTE_INPUT_HID_MAIN; // we only accept one note input (the main one)

function fract(x: number) {
  return x - Math.floor(x);
}

export class ArpeggiatorGenerator implements ParametricNoteGenerator<NoteInputHandle> {
  inputs = 1 as const;
  style: Style = "UP";
  speed = 0.25;
  sync = false;
  division = "1/16";
  bpm = DEFAULT_BPM;
  lastNotes: number[] = [];
  lastInput: number[] = [];
  lastTime: number = 0;

  /** The duration of a single note, in seconds. */
  get stepLength() {
    return this.sync ? divisionLength(this.division, this.bpm) : this.speed;
  }

  /** Gets the index of the note, out of `noteCount` sorted notes, that is played at `time`. */
  indexAt(time: number, noteCount: number) {
    const step = this.stepLength;

    // https://www.desmos.com/calculator/rgyhezrleq
    return match(this.style, {
      "UP": Math.floor(((1 / step) * time)) % noteCount,
      "DOWN": -Math.floor(((1 / step) * time) % noteCount) + (noteCount - 1),
      "RANDOM": Math.floor(
        fract(
          Math.sin(Math.floor(time / step))
          * (Math.sin((Math.floor(time / 64) + 1) * 456.341) * 456735.4352)
        )
        * noteCount
      )
    });
  }

  generate(time: number, inputs: Map<NoteInputHandle, number[]>): number[] {
    let input = inputs.get("in-notes-main");
    assert(input, "no 'in-notes-main' input was provided");

    this.lastTime = time;
    
    if (input.length == 0) {
      this.lastInput = [];
      this.lastNotes = [];
      return this.lastNotes;
    }

    input = [...input].sort((a, b) => a - b);
    this.lastInput = input;

    this.lastNotes = [input[this.indexAt(time, input.length)]];
    return this.lastNotes;
  }
}

export class ArpeggiatorNodeData extends NoteGeneratorNodeData<NoteInputHandle> {
  generator = new ArpeggiatorGenerator();
};

export class ArpeggiatorNodeSerializer extends FlatNodeDataSerializer<ArpeggiatorNodeData> {
  type = "arpeggiator";
  dataFactory = () => new ArpeggiatorNodeData();

  spec = {
    m: this.prop(self => self.generator).with("style"),
    s: this.prop(self => self.generator).with("speed"),
    y: this.prop(self => self.generator).with("sync", false), // since Vestige 0.6.0
    v: this.prop(self => self.generator).with("division", "1/16"), // since Vestige 0.6.0
    t: this.prop(self => self.generator).with("bpm", DEFAULT_BPM) // since Vestige 0.6.0
  };
}

export type ArpeggiatorNode = flow.Node<ArpeggiatorNodeData, "arpeggiator">;

/** Creates a new `ArpeggiatorNode` with a random ID. */
export const createArpeggiatorNode = makeNodeFactory("arpeggiator", () => new ArpeggiatorNodeData());

/** Provides a `NodeTypeDescriptor` which describes arpeggiator nodes. */
export const ARPEGGIATOR_NOTE_DESCRIPTOR = {
  displayName: "Arpeggiator",
  icon: cls => <RiDice3Fill className={cls}/>,
  help: <>
    The <b>arpeggiator</b> node breaks down a chord into individual notes, creating what is commonly
    called an <b>arpeggio</b>. The <b>order</b> determines which note is played next, and
    the <b>step</b> is how long each note lasts.
  </>,
  create: createArpeggiatorNode
} satisfies NodeTypeDescriptor;

/** The amount of already played steps displayed by the piano roll. */
const ROLL_PAST_STEPS = 4;

/** The amount of upcoming steps displayed by the piano roll. */
const ROLL_FUTURE_STEPS = 12;

/** The width of the part of the piano roll with note names, in pixels. */
const ROLL_GUTTER = 34;

/** The height of the lowest row that has enough room for its note name, in pixels. */
const MIN_LABELED_HEIGHT = 10;

/** The distance between notes and the edges of their cells, in pixels. */
const NOTE_MARGIN = 1.5;

/** The corner radius of notes, in pixels. */
const NOTE_RADIUS = 2;

/**
 * Gets the color of a note that plays from `start` to `end`, with `now` being the
 * current time.
 */
function stepColor(start: number, end: number, now: number) {
  if (end <= now)
    return VIZ_COLORS.primarySoft;

  if (start > now)
    return VIZ_COLORS.primaryFaint;

  return VIZ_COLORS.primary;
}

/** Displays the recent and upcoming notes of an arpeggiator. */
function ArpeggiatorRoll({ gen }: { gen: ArpeggiatorGenerator }) {
  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    clearViz(ctx, width, height);

    const input = gen.lastInput;
    const noteCount = input.length;

    if (noteCount == 0) {
      vizLabel(
        ctx,
        "no input",
        width / 2,
        (height - LABEL_HEIGHT) / 2,
        "center"
      );

      return;
    }

    const rowHeight = height / noteCount;
    const rollWidth = width - ROLL_GUTTER;
    const now = gen.lastTime;
    const span = (ROLL_PAST_STEPS + ROLL_FUTURE_STEPS) * gen.stepLength;
    const start = now - ROLL_PAST_STEPS * gen.stepLength;
    const timeToX = (t: number) => ROLL_GUTTER + ((t - start) / span) * rollWidth;

    for (let row = 0; row < noteCount; row++) {
      const y = height - (row + 1) * rowHeight;

      if (row != 0) {
        hLine(ctx, y + rowHeight, width);
      }

      if (rowHeight >= MIN_LABELED_HEIGHT) {
        const labelY = y + (rowHeight - LABEL_HEIGHT) / 2;
        vizLabel(ctx, midiToName(input[row]), LABEL_MARGIN, labelY);
      }
    }

    vLine(ctx, ROLL_GUTTER, height, VIZ_COLORS.muted);

    const firstStep = Math.floor(start / gen.stepLength);
    for (let step = firstStep; step * gen.stepLength < start + span; step++) {
      const stepStart = step * gen.stepLength;
      const stepEnd = stepStart + gen.stepLength;
      const row = gen.indexAt(stepStart + (gen.stepLength / 2), noteCount);

      const left = Math.max(ROLL_GUTTER, timeToX(stepStart));
      const right = Math.min(width, timeToX(stepEnd));
      if (right <= left)
        continue;

      ctx.fillStyle = stepColor(stepStart, stepEnd, now);

      const y = height - (row + 1) * rowHeight;
      ctx.beginPath();
      ctx.roundRect(
        left + NOTE_MARGIN,
        y + NOTE_MARGIN,
        right - left - NOTE_MARGIN * 2,
        rowHeight - NOTE_MARGIN * 2,
        NOTE_RADIUS
      );
      ctx.fill();
    }

    vLine(ctx, timeToX(now), height, VIZ_COLORS.primary);
  }

  return <VizCanvas draw={draw} height={104} />;
}

export const ArpeggiatorNodeRenderer = memo(function ArpeggiatorNodeRenderer(
  { id, data }: flow.NodeProps<flow.Node<ArpeggiatorNodeData>>
) {
  const [style, setStyle] = useBoundState(data.generator, "style");
  const [speed, setSpeed] = useBoundState(data.generator, "speed");
  const { sync, onSyncChange, division, setDivision, bpm, setBpm } = useTempoSync(
    data.generator,
    () => speed
  );

  const notes = useNoteGeneratorSync(() => data.generator.lastNotes);

  return (
    <VestigeNodeBase
      id={id} onRemove={() => {}}
      name="Arpeggiator"
      help={ARPEGGIATOR_NOTE_DESCRIPTOR.help}
    >
      <div className="flex flex-col gap-6 w-full">
        <div className="flex justify-between gap-4">
          <NodePort nodeId={id} handleId={NOTE_INPUT_HID_MAIN} kind="input" type="notes">
            <PlainField name="chord" />
          </NodePort>

          <NodePort nodeId={id} handleId={NOTE_OUTPUT_HID} kind="output" type="notes">
            <PlainField align="right" name="notes" />
          </NodePort>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-baseline">
            <span className="font-semibold">pattern</span>
            <span className={`tabular-nums font-semibold ${notes.length == 0 ? "text-gray-400" : "text-primary"}`}>
              { notes.length == 0 ? "-" : midiToName(notes[0]) }
            </span>
          </div>

          <ArpeggiatorRoll gen={data.generator} />
        </div>

        <SelectField
          name="order"
          value={style} onChange={x => setStyle(x as Style)} 
        >
          <option value="UP">up</option>
          <option value="DOWN">down</option>
          <option value="RANDOM">random</option>
        </SelectField>

        {
          sync ? (
            <DivisionField
              name="step"
              value={division} onChange={setDivision}
              bpm={bpm} onBpmChange={setBpm}
              onSyncedChange={onSyncChange}
              maxBeats={4}
            />
          ) : (
            <SliderField
              name="step"
              value={speed} onChange={setSpeed}
              min={MIN_SPEED} max={MAX_SPEED} step={0.01}
              valueStringifier={x => `${Math.round(x * 1000)} ms`}
              valueParser={x => x / 1000}
              headerAccessory={<SyncToggle synced={false} onChange={onSyncChange}/>}
            />
          )
        }
      </div>
    </VestigeNodeBase>
  );
});
