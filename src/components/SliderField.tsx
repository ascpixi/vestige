import React, { useCallback } from "react";

import { Automatable } from "../graph";
import { useUpdater } from "../hooks";

function stringifyFloat(x: number) {
  const s = x.toString();
  const sep = s.indexOf(".");
  return sep == -1 ? s : s.substring(0, sep);
}

export function SliderField({
  name, description, min, max, value, step, automatable, automatableDisplay,
  isPercentage, valueStringifier, onChange
}: {
  /** The name of the input field. */
  name: string,

  /** A user-friendly description of the input field. */
  description: string,

  /** The minimum value the field accepts. */
  min: number,

  /** The maximum value the field accepts. */
  max: number,

  /** The current value of the field. Ignored if `automatable?.isAutomated()` returns `true`. */
  value: number,

  /** The smallest increment of the slider. Defaults to 1. */
  step?: number,

  /**
   * If this value can be automated, this property specifies the actual
   * `Automatable` object that may control this field. 
   */
  automatable?: Automatable,

  /**
   * If `automatable?.isAutomated()` returns `true`, this function will be called
   * to obtain the actual value in order to display it in the UI.
   */
  automatableDisplay?: () => number,

  /**
   * If `true`, the field will be displayed as a percentage, with a `%` suffix
   * after the value. Only applies if `valueStringifier` is not specified.
   */
  isPercentage?: boolean,

  /** If specified, the given function will be called to format the value. */
  valueStringifier?: (x: number) => string,

  /** Invoked when the value changes.  */
  onChange: (x: number) => void
}) {
  useUpdater(
    useCallback(() => automatable?.isAutomated() ?? false, [automatable])
  );

  const automated = automatable?.isAutomated();
  if (automated && automatableDisplay) {
    value = automatableDisplay();
  } 

  valueStringifier ??= () => `${stringifyFloat(value)}${isPercentage ? "%" : ""}`;
  step ??= 1;

  function handleMouseDown(ev: React.MouseEvent<HTMLInputElement>) {
    ev.stopPropagation();
  }

  return (
    <div className="flex flex-col gap-1 align-middle">
      <span className="font-semibold">
        {name}
        <span className="text-gray-300"> ({valueStringifier(value)})</span>
      </span>

      <span>{description}</span>

      <input
        type="range"
        min={min} max={max} value={value} step={step}
        onChange={ev => onChange(ev.target.valueAsNumber)}
        onMouseDownCapture={handleMouseDown}
        className={`range range-xs ${automated ? "" : "range-primary"}`}
        disabled={automated}
        aria-label={`${name}: ${description}`}
      />
    </div>
  );
}