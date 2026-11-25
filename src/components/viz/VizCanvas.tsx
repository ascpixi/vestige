import { useEffect, useRef } from "react";

import { Point } from "../../util";

/**
 * A function that draws onto a canvas. The coordinate space is in CSS pixels,
 * with `width` and `height` describing its dimensions.
 */
export type DrawFunction = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => void;

/** The colors used by all visualizations. */
export const VIZ_COLORS = {
  background: "#fafafa",
  grid: "#ececec",
  label: "#a3a3a3",
  muted: "#d4d4d4",
  primary: "#e8137a",
  primaryFaint: "rgba(232, 19, 122, 0.14)",
  primarySoft: "rgba(232, 19, 122, 0.35)"
} as const;

let primaryResolved = false;

/** Resolves the primary color of the current theme, so that visualizations match it. */
function resolvePrimary() {
  if (primaryResolved)
    return;

  primaryResolved = true;

  const probe = document.createElement("div");
  probe.className = "bg-primary";
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx || !color)
    return;

  // We rely on the canvas normalizing any opaque CSS color into the form of #rrggbb.
  ctx.fillStyle = color;
  const normalized = ctx.fillStyle;

  const channels = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!channels)
    return;

  const [r, g, b] = channels.slice(1).map(x => parseInt(x, 16));
  const colors = VIZ_COLORS as Record<string, string>;
  colors.primary = normalized;
  colors.primaryFaint = `rgba(${r}, ${g}, ${b}, 0.14)`;
  colors.primarySoft = `rgba(${r}, ${g}, ${b}, 0.35)`;
}

/**
 * A canvas that automatically handles device pixel ratios and resizing, and calls
 * `draw` on every animation frame.
 */
export function VizCanvas({ draw, height, className }: {
  /** Called on each animation frame. Should be cheap, and skip work when nothing changed. */
  draw: DrawFunction,

  /**
   * The height of the canvas, in CSS pixels. If not specified, the canvas fills its
   * (flex column) parent.
   */
  height?: number,

  /** Additional CSS classes to apply to the canvas. */
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    resolvePrimary();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let frameId = 0;

    function frame() {
      frameId = requestAnimationFrame(frame);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const actualHeight = height ?? canvas.clientHeight;
      const pxWidth = Math.round(width * dpr);
      const pxHeight = Math.round(actualHeight * dpr);

      if (canvas.width != pxWidth || canvas.height != pxHeight) {
        canvas.width = pxWidth;
        canvas.height = pxHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, width, actualHeight);
    }

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [height]);

  return (
    <canvas
      ref={canvasRef}
      style={height ? { height } : undefined}
      className={`
        w-full rounded-md border border-gray-200
        ${height ? "" : "flex-1 min-h-0"}
        ${className ?? ""}
      `}
    />
  );
}

/** Clears the canvas and fills it with the visualization background. */
export function clearViz(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = VIZ_COLORS.background;
  ctx.fillRect(0, 0, width, height);
}

/** Draws a horizontal line across the canvas at the given `y` coordinate. */
export function hLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  color: string = VIZ_COLORS.grid
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(y) + 0.5);
  ctx.lineTo(width, Math.round(y) + 0.5);
  ctx.stroke();
}

/** Draws a vertical line across the canvas at the given `x` coordinate. */
export function vLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  color: string = VIZ_COLORS.grid
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, 0);
  ctx.lineTo(Math.round(x) + 0.5, height);
  ctx.stroke();
}

/** Draws a line that goes through all of the given points. */
export function strokePoints(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string = VIZ_COLORS.primary
) {
  const path = new Path2D();
  points.forEach(point => path.lineTo(point.x, point.y));

  strokeCurve(ctx, path, color);
}

/** Strokes the given curve in the line style shared by all visualizations. */
export function strokeCurve(
  ctx: CanvasRenderingContext2D,
  curve: Path2D,
  color: string = VIZ_COLORS.primary
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke(curve);
}

/** Draws a dot that marks the given point. */
export function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const radius = 3.5;

  ctx.fillStyle = VIZ_COLORS.primary;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** The amount of vertical space that a label takes up, in pixels. */
export const LABEL_HEIGHT = 12;

/** The distance between labels and the edges of the visualization, in pixels. */
export const LABEL_MARGIN = 4;

/** Draws a small label in the visualization font. */
export function vizLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign = "left",
  color: string = VIZ_COLORS.label
) {
  ctx.font = "10px 'Fira Code', monospace";
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

/** The lowest frequency displayed by frequency-domain visualizations, in Hz. */
const MIN_HZ = 20;

/** The highest frequency displayed by frequency-domain visualizations, in Hz. */
const MAX_HZ = 20_000;

/** Maps a frequency to a position on a logarithmic axis spanning `[minHz; maxHz]`. */
export function freqToX(hz: number, width: number, minHz = MIN_HZ, maxHz = MAX_HZ) {
  return (Math.log10(hz / minHz) / Math.log10(maxHz / minHz)) * width;
}

/** Inverse of `freqToX`. */
export function xToFreq(x: number, width: number, minHz = MIN_HZ, maxHz = MAX_HZ) {
  return minHz * Math.pow(maxHz / minHz, x / width);
}

/** The frequencies that are labeled in frequency-domain visualizations. */
export const FREQ_GRID = [
  { hz: 100, label: "100" },
  { hz: 1000, label: "1k" },
  { hz: 10_000, label: "10k" }
];

/** Draws the frequency grid used by frequency-domain visualizations. */
export function drawFreqGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  for (const { hz, label } of FREQ_GRID) {
    const x = freqToX(hz, width);
    vLine(ctx, x, height);
    vizLabel(ctx, label, x + LABEL_MARGIN, height - LABEL_HEIGHT);
  }
}
