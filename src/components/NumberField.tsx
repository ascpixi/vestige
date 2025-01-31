import React, { useCallback } from "react";

import { Automatable } from "../graph";
import { useUpdater } from "../hooks";

export function NumberField({
  name, description, value, step, automatable, automatableDisplay, onChange, disabled
}: {
  /** The name of the input field. */
  name: string,

  /** A user-friendly description of the input field. */
  description: string,

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

  /** Invoked when the value changes. */
  onChange: (x: number) => void,

  /** If `true`, any user input to the field will be disabled. */
  disabled?: boolean
}) {
  useUpdater(
    useCallback(() => automatable?.isAutomated() ?? false, [automatable])
  );

  const automated = automatable?.isAutomated();
  if (automated && automatableDisplay) {
    value = automatableDisplay();
  } 

  step ??= 1;

  function handleMouseDown(ev: React.MouseEvent<HTMLInputElement>) {
    ev.stopPropagation();
  }

  return (
    <div className="flex flex-col gap-1 align-middle">
      <span className="font-semibold">{name}</span>
      <span>{description}</span>

      <input
        type="number"
        value={value} step={step}
        onChange={ev => onChange(ev.target.valueAsNumber)}
        onMouseDownCapture={handleMouseDown}
        className="input input-xs"
        disabled={automated || disabled}
        aria-label={`${name}: ${description}`}
      />
    </div>
  );
}