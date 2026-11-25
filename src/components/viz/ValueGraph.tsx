import { range } from "../../util";

import { clearViz, drawDot, hLine, LABEL_MARGIN, strokePoints, VIZ_COLORS, VizCanvas, vizLabel } from "./VizCanvas";

/** The distance between the graph and the edges of the canvas, in pixels. */
const PADDING = 6;

/**
 * Displays a time-varying value over the time window of `span` seconds that ends at
 * `now()`, with the current value marked on the right edge.
 */
export function ValueGraph({ valueAt, now, span, min, max, label, height }: {
  /** Gets the value (0.0 to 1.0) at the given time. Should be a pure function. */
  valueAt: (time: number) => number,

  /** Gets the current time, in seconds. */
  now: () => number,

  /** Gets the amount of seconds that the graph should span. */
  span: () => number,

  /** If specified, highlights the range between `min()` and `max()`. */
  min?: () => number,
  max?: () => number,

  /** If specified, a label to draw in the top-right corner. */
  label?: () => string,

  /** The height of the graph, in pixels. */
  height?: number
}) {
  function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const valueToY = (x: number) => PADDING + (1 - x) * (height - PADDING * 2);

    clearViz(ctx, width, height);

    if (min && max) {
      ctx.fillStyle = VIZ_COLORS.primaryFaint;
      const top = valueToY(max());
      ctx.fillRect(0, top, width, valueToY(min()) - top);
    }

    hLine(ctx, valueToY(0.5), width);

    if (label) {
      vizLabel(
        ctx,
        label(),
        width - LABEL_MARGIN,
        LABEL_MARGIN,
        "right"
      );
    }

    const time = now();
    const duration = span();

    const points = range(Math.floor(width) + 1).map(x => ({
      x,
      y: valueToY(valueAt(time - duration + (x / width) * duration))
    }));

    strokePoints(ctx, points);
    drawDot(ctx, width - PADDING, valueToY(valueAt(time)));
  }

  return <VizCanvas draw={draw} height={height ?? 80} />;
}
