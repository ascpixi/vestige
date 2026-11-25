import * as tone from "tone";
import React, { useEffect, useRef } from "react";

import { formatMilliseconds } from "../../audioUtil";
import { clamp, lerp, Point, range } from "../../util";

import { clearViz, DrawFunction, drawFreqGrid, FREQ_GRID, freqToX, hLine, LABEL_HEIGHT, LABEL_MARGIN, strokeCurve, strokePoints, VIZ_COLORS, VizCanvas, vizLabel, xToFreq } from "./VizCanvas";

export type ScopeMode = "WAVEFORM" | "SPECTRUM" | "SPECTROGRAM";

const FFT_SIZE = 16384;
const MIN_DB = -96;
const MAX_DB = 0;

/** The default amount of time displayed by the oscilloscope, in seconds. */
export const DEFAULT_TIME_WINDOW = 0.02;

/** The shortest amount of time the oscilloscope can display, in seconds. */
export const MIN_TIME_WINDOW = 0.001;

/**
 * The longest amount of time the oscilloscope can display, in seconds. We're limited by
 * the size of the analyser here.
 */
export const MAX_TIME_WINDOW = 0.34;

/** Clamps an oscilloscope time window to the supported range. */
export function clampTimeWindow(x: number) {
  return clamp(x, MIN_TIME_WINDOW, MAX_TIME_WINDOW);
}

/** Signals quieter than this (in absolute sample value) are considered silence. */
const SILENCE_THRESHOLD = 1e-4;

/** The amount of frames between attempts to re-connect to the analyzed node. */
const RECONNECT_INTERVAL = 30;

/** The smallest amount of samples the oscilloscope can display. */
const MIN_SPAN = 8;

/** Signals with a peak lower than this aren't scaled up any further to fill the oscilloscope. */
const MIN_PEAK = 0.25;

/** The portion of the height of the oscilloscope that the loudest sample takes up. */
const WAVEFORM_SCALE = 0.9;

/** The multiplier applied to the intensity of the spectrogram, so that quiet sounds are visible. */
const SPECTROGRAM_BOOST = 1.15;

/** The change of the time window for each pixel scrolled with the mouse wheel. */
const ZOOM_FACTOR = 1.0015;

/**
 * Creates an analyser connected to `source`. The returned `maintain` function should be
 * called on every frame, in order to keep the analyser connected.
 */
export function useAnalyser(source: tone.ToneAudioNode | null) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameCount = useRef(0);

  useEffect(() => {
    if (!source)
      return;

    const analyser = source.context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.75;
    analyser.minDecibels = MIN_DB;
    analyser.maxDecibels = MAX_DB;

    source.connect(analyser);
    analyserRef.current = analyser;

    return () => {
      analyserRef.current = null;

      try {
        source.disconnect(analyser);
      }
      catch {
        // The source has already been disconnected or disposed, so we have nothing to clean up.
      }
    };
  }, [source]);

  function maintain() {
    const analyser = analyserRef.current;

    if (!analyser || !source)
      return analyser;

    frameCount.current++;

    if (frameCount.current % RECONNECT_INTERVAL == 0) {
      // Nodes call `disconnect()` on their outputs when their connections in the graph
      // change, which also removes our analyser. We simply re-connect it periodically.
      try {
        source.connect(analyser);
      }
      catch {
        // The source has been disposed, so there's nothing left to analyze.
      }
    }

    return analyser;
  }

  return maintain;
}

/**
 * Interpolates between `p1` and `p2` by `t` with a Catmull-Rom spline, with `p0` and `p3`
 * being the points around them.
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

/**
 * Samples the power spectrum in `buffer` (in dB, as returned by `getFloatFrequencyData`)
 * over the frequency range `[minHz; maxHz]`.
 *
 * On a logarithmic axis, a single FFT bin can span many pixels at low frequencies, while a
 * single pixel can span many bins at high frequencies. When the range is narrower than a
 * bin, the bins are interpolated with a Catmull-Rom spline, which gives smooth curves
 * instead of steps. Otherwise, the power of all bins in the range is averaged.
 */
export function sampleSpectrum(
  buffer: Float32Array,
  binHz: number,
  minHz: number,
  maxHz: number
) {
  function levelAt(bin: number) {
    return Math.max(MIN_DB, buffer[clamp(bin, 0, buffer.length - 1)]);
  }

  const firstBin = minHz / binHz;
  const lastBin = maxHz / binHz;

  if (lastBin - firstBin < 1) {
    const center = (firstBin + lastBin) / 2;
    const bin = Math.floor(center);

    return catmullRom(
      levelAt(bin - 1),
      levelAt(bin),
      levelAt(bin + 1),
      levelAt(bin + 2),
      center - bin
    );
  }

  let power = 0;
  let count = 0;
  for (let bin = Math.floor(firstBin); bin <= Math.ceil(lastBin) && bin < buffer.length; bin++) {
    power += Math.pow(10, levelAt(bin) / 10);
    count++;
  }

  return 10 * Math.log10(power / Math.max(1, count));
}

/** Maps a level in dB to a value from 0.0 to 1.0, with 0.0 being the quietest displayed level. */
function normalizeDb(db: number) {
  return (Math.max(MIN_DB, db) - MIN_DB) / (MAX_DB - MIN_DB);
}

/** The distance between consecutive points of a spectrum curve, in pixels. */
const SPECTRUM_POINT_SPACING = 2;

/**
 * Draws the frequency spectrum currently captured by `analyser`, using `buffer` as
 * temporary storage. Frequencies are drawn on a logarithmic axis.
 */
export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  buffer: Float32Array<ArrayBuffer>,
  width: number,
  height: number,
  fill: string,
  stroke?: string
) {
  analyser.getFloatFrequencyData(buffer);
  const binHz = analyser.context.sampleRate / analyser.fftSize;

  const points: Point[] = [];
  for (let x = 0; x <= width + SPECTRUM_POINT_SPACING; x += SPECTRUM_POINT_SPACING) {
    const half = SPECTRUM_POINT_SPACING / 2;
    const level = sampleSpectrum(
      buffer,
      binHz,
      xToFreq(x - half, width),
      xToFreq(x + half, width)
    );

    points.push({ x, y: height - normalizeDb(level) * height });
  }

  // We average neighboring points to get rid of the remaining jaggedness.
  const smoothed = points.map((point, i) => {
    if (i == 0 || i == points.length - 1)
      return point;

    const neighbors = (points[i - 1].y + points[i + 1].y) / 2;
    return { x: point.x, y: (point.y + neighbors) / 2 };
  });

  const curve = new Path2D();
  curve.moveTo(smoothed[0].x, smoothed[0].y);

  // We go through the midpoints of consecutive points, using the points themselves to
  // control the curve.
  for (let i = 1; i < smoothed.length - 1; i++) {
    const point = smoothed[i];
    const next = smoothed[i + 1];
    curve.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) / 2,
      (point.y + next.y) / 2
    );
  }

  const area = new Path2D(curve);
  area.lineTo(width, height);
  area.lineTo(0, height);
  area.closePath();

  ctx.fillStyle = fill;
  ctx.fill(area);

  if (stroke) {
    strokeCurve(ctx, curve, stroke);
  }
}

/** Creates a buffer suitable for `drawSpectrum`. */
export function makeSpectrumBuffer() {
  return new Float32Array(FFT_SIZE / 2);
}

/**
 * The colors of the spectrogram, from the quietest to the loudest. They go from white,
 * through pink, to deep purple, which keeps the spectrogram readable on the light
 * background of the rest of the interface.
 */
const SPECTROGRAM_PALETTE = [
  [250, 250, 250],
  [246, 170, 205],
  [232, 19, 122],
  [94, 16, 112],
  [24, 8, 40]
];

/** Maps a normalized intensity (0.0 to 1.0) to a color of the spectrogram palette. */
function spectrogramColor(intensity: number) {
  const position = clamp(intensity) * (SPECTROGRAM_PALETTE.length - 1);
  const colorIdx = Math.min(SPECTROGRAM_PALETTE.length - 2, Math.floor(position));
  const nextColor = SPECTROGRAM_PALETTE[colorIdx + 1];

  return SPECTROGRAM_PALETTE[colorIdx]
    .map((channel, i) => lerp(channel, nextColor[i], position - colorIdx));
}

/** Gets the highest absolute value of the given samples. */
function findPeak(samples: Float32Array) {
  return samples.reduce((peak, x) => Math.max(peak, Math.abs(x)), 0);
}

/**
 * Finds the position from which `span` samples should be displayed. The position is always
 * a rising zero-crossing (if there is one), which keeps periodic signals stable on screen.
 */
function findDisplayStart(samples: Float32Array, span: number) {
  // We search from the end, so that we display the newest audio.
  for (let i = samples.length - span; i > 0; i--) {
    if (samples[i - 1] <= 0 && samples[i] > 0) {
      return i;
    }
  }

  return samples.length - span;
}

/**
 * Creates the points of a waveform `width` pixels wide, which displays `span` samples,
 * beginning with the one at `start`.
 */
function makeWaveformPoints(
  samples: Float32Array,
  start: number,
  span: number,
  width: number,
  sampleToY: (sample: number) => number
): Point[] {
  const samplesPerPixel = span / width;
  const columns = range(Math.ceil(width));

  // If we're zoomed in far enough for samples to be wider than a pixel, we have to
  // interpolate between them.
  if (samplesPerPixel <= 1)
    return columns.map(x => {
      const position = start + x * samplesPerPixel;
      const sampleIdx = Math.floor(position);
      const next = samples[Math.min(samples.length - 1, sampleIdx + 1)];

      return { x, y: sampleToY(lerp(samples[sampleIdx], next, position - sampleIdx)) };
    });

  // Multiple samples share a single pixel, so we draw the range that they cover.
  return columns.flatMap(x => {
    const covered = samples.subarray(
      start + Math.floor(x * samplesPerPixel),
      start + Math.floor((x + 1) * samplesPerPixel)
    );

    return [
      { x, y: sampleToY(Math.max(...covered)) },
      { x, y: sampleToY(Math.min(...covered)) }
    ];
  });
}

/**
 * Displays a live visualization of the audio coming out of `source`.
 */
export function AudioScope({ source, mode, height, fill, idle, timeWindow, onTimeWindowChange }: {
  /** The node to analyze. A `null` value displays an empty scope. */
  source: tone.ToneAudioNode | null,

  /** The kind of visualization to display. Defaults to `"WAVEFORM"`. */
  mode?: ScopeMode,

  /** The height of the scope, in pixels. */
  height?: number,

  /**
   * If `true`, the scope grows to fill the remaining space of its (flex) parent, with
   * `height` being its minimum height.
   */
  fill?: boolean,

  /** If specified, invoked instead of drawing a flat line while the source is silent. */
  idle?: DrawFunction,

  /** The amount of time displayed by the oscilloscope, in seconds. */
  timeWindow?: number,

  /** If specified, the user can zoom the oscilloscope with the mouse wheel. */
  onTimeWindowChange?: (seconds: number) => void
}) {
  mode ??= "WAVEFORM";
  height ??= 72;
  timeWindow ??= DEFAULT_TIME_WINDOW;

  const maintainAnalyser = useAnalyser(source);
  const waveformBuffer = useRef(new Float32Array(FFT_SIZE));
  const spectrumBuffer = useRef(makeSpectrumBuffer());
  const spectrogram = useRef<HTMLCanvasElement | null>(null);

  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const analyser = maintainAnalyser();

    if (mode == "SPECTROGRAM") {
      drawSpectrogram(ctx, width, height, analyser);
      return;
    }

    clearViz(ctx, width, height);

    if (mode == "SPECTRUM") {
      drawFreqGrid(ctx, width, height);

      if (analyser) {
        drawSpectrum(
          ctx,
          analyser,
          spectrumBuffer.current,
          width,
          height,
          VIZ_COLORS.primaryFaint,
          VIZ_COLORS.primary
        );
      }

      return;
    }

    hLine(ctx, height / 2, width);

    const samples = waveformBuffer.current;
    analyser?.getFloatTimeDomainData(samples);

    const peak = findPeak(samples);
    if (!analyser || peak < SILENCE_THRESHOLD) {
      idle?.(ctx, width, height);
      return;
    }

    const requestedSpan = Math.round(timeWindow! * analyser.context.sampleRate);
    const span = clamp(requestedSpan, MIN_SPAN, samples.length);

    const scale = (height / 2) * WAVEFORM_SCALE / Math.max(peak, MIN_PEAK);
    const points = makeWaveformPoints(
      samples,
      findDisplayStart(samples, span),
      span,
      width,
      sample => (height / 2) - (sample * scale)
    );

    strokePoints(ctx, points);

    if (onTimeWindowChange) {
      vizLabel(
        ctx,
        formatMilliseconds(timeWindow!),
        width - LABEL_MARGIN,
        LABEL_MARGIN,
        "right"
      );
    }
  }

  function drawSpectrogram(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    analyser: AnalyserNode | null
  ) {
    const bufferWidth = Math.round(width);
    const bufferHeight = Math.round(height);

    let buffer = spectrogram.current;
    if (buffer?.width != bufferWidth || buffer.height != bufferHeight) {
      buffer = document.createElement("canvas");
      buffer.width = bufferWidth;
      buffer.height = bufferHeight;

      const bufferCtx = buffer.getContext("2d")!;
      bufferCtx.fillStyle = VIZ_COLORS.background;
      bufferCtx.fillRect(0, 0, buffer.width, buffer.height);

      spectrogram.current = buffer;
    }

    const bufferCtx = buffer.getContext("2d")!;

    if (analyser) {
      analyser.getFloatFrequencyData(spectrumBuffer.current);
      const binHz = analyser.context.sampleRate / analyser.fftSize;

      // We scroll the existing image to the left by a single pixel, and then draw the newest
      // column on the right edge.
      bufferCtx.drawImage(buffer, -1, 0);

      const column = bufferCtx.createImageData(1, buffer.height);
      for (let y = 0; y < buffer.height; y++) {
        const level = sampleSpectrum(
          spectrumBuffer.current,
          binHz,
          xToFreq(buffer.height - y - 0.5, buffer.height),
          xToFreq(buffer.height - y + 0.5, buffer.height)
        );

        const color = spectrogramColor(normalizeDb(level) * SPECTROGRAM_BOOST);

        column.data.set([...color, 255], y * 4);
      }

      bufferCtx.putImageData(column, buffer.width - 1, 0);
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(buffer, 0, 0, width, height);

    for (const { hz, label } of FREQ_GRID) {
      const y = height - freqToX(hz, height) - LABEL_HEIGHT;
      vizLabel(ctx, label, LABEL_MARGIN, y);
    }
  }

  function handleWheel(ev: React.WheelEvent<HTMLDivElement>) {
    if (!onTimeWindowChange || mode != "WAVEFORM")
      return;

    // Scrolling up zooms in, scrolling down zooms out.
    const factor = Math.pow(ZOOM_FACTOR, ev.deltaY);
    onTimeWindowChange(clampTimeWindow(timeWindow! * factor));
  }

  return (
    <div
      onWheel={handleWheel}
      style={fill ? { minHeight: height } : undefined}
      className={`
        ${onTimeWindowChange && mode == "WAVEFORM" ? "nowheel" : ""}
        ${fill ? "flex-1 flex flex-col" : ""}
      `}
    >
      <VizCanvas draw={draw} height={fill ? undefined : height} />
    </div>
  );
}
