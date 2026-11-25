import React, { useCallback } from "react";

import { Automatable } from "../graph";
import { useUpdater } from "../hooks";
import { clamp } from "../util";

import { EditableValue } from "./EditableValue";

function stringifyFloat(x: number) {
  const s = x.toString();
  const sep = s.indexOf(".");
  return sep == -1 ? s : s.substring(0, sep);
}

/** Extracts the leading number of a formatted value, e.g. `"663.32 Hz"` becomes `"663.32"`. */
function numericPart(formatted: string) {
  const matches = formatted.match(/-?\d+(\.\d+)?/);
  return matches ? matches[0] : "";
}

export function SliderField({
  name, description, min, max, value, step, automatable, automatableDisplay,
  isPercentage, valueStringifier, valueParser, secondaryUnit, headerAccessory, onChange
}: {
  /** The name of the input field. */
  name: string,

  /** A user-friendly description of the input field. */
  description?: string,

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

  /**
   * Converts a number typed in by the user (in the units displayed by `valueStringifier`)
   * back to a value of the slider. If not specified, the typed number is used as-is.
   */
  valueParser?: (x: number) => number,

  /**
   * If specified, the value will additionally be displayed (and editable) in this unit.
   * `format` receives the value of the slider, and `parse` should return one.
   */
  secondaryUnit?: { format: (x: number) => string, parse: (x: number) => number },

  /** If specified, an element to display at the end of the header of the field. */
  headerAccessory?: React.ReactNode,

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

  function handleCommit(x: number, alreadyParsed = false) {
    const parsed = valueParser && !alreadyParsed ? valueParser(x) : x;
    if (!Number.isFinite(parsed))
      return;

    onChange(clamp(parsed, min, max));
  }

  const formatted = valueStringifier(value);

  return (
    <div className="flex flex-col gap-1 align-middle">
      <div className="flex justify-between items-center gap-4">
        <span className="font-semibold">{name}</span>

        <div className="flex items-center gap-2 min-w-0">
          {
            !secondaryUnit ? <></> : <>
              <EditableValue
                display={secondaryUnit.format(value)}
                editText={numericPart(secondaryUnit.format(value))}
                disabled={automated}
                onCommit={x => handleCommit(secondaryUnit.parse(x), true)}
                ariaLabel={`${name} value (secondary unit)`}
              />

              <span className="text-gray-300">/</span>
            </>
          }

          <EditableValue
            display={formatted}
            editText={numericPart(formatted)}
            disabled={automated}
            onCommit={handleCommit}
            ariaLabel={`${name} value`}
          />

          {headerAccessory}
        </div>
      </div>

      { !description ? <></> : <span className="text-gray-500">{description}</span> }

      <input
        type="range"
        min={min} max={max} value={value} step={step}
        onChange={ev => onChange(ev.target.valueAsNumber)}
        onMouseDownCapture={handleMouseDown}
        className={`nodrag range range-xs ${automated ? "" : "range-primary"}`}
        disabled={automated}
        aria-label={name}
      />
    </div>
  );
}