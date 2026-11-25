import React, { useRef, useState } from "react";

/**
 * Displays a formatted value which, when clicked, turns into a text input that allows
 * the user to type in an exact value.
 */
export function EditableValue({ display, editText, disabled, onCommit, ariaLabel }: {
  /** The formatted value to display when the field isn't being edited. */
  display: string,

  /** The initial text of the input when editing begins. */
  editText: string,

  /** If `true`, the value cannot be edited. */
  disabled?: boolean,

  /** Invoked with the parsed number when the user confirms their input. */
  onCommit: (x: number) => void,

  /** If specified, a label of the value, for use by assistive technologies. */
  ariaLabel?: string
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function beginEdit() {
    if (disabled)
      return;

    setText(editText);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commit() {
    const parsed = parseFloat(text);
    setEditing(false);

    if (!Number.isNaN(parsed)) {
      onCommit(parsed);
    }
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    ev.stopPropagation();

    if (ev.key == "Enter") {
      commit();
    }
    else if (ev.key == "Escape") {
      setEditing(false);
    }
  }

  function handleDisplayKeyDown(ev: React.KeyboardEvent<HTMLSpanElement>) {
    if (ev.key == "Enter") {
      beginEdit();
    }
  }

  function handleDisplayMouseDown(ev: React.MouseEvent<HTMLSpanElement>) {
    if (!disabled) {
      ev.stopPropagation();
    }
  }

  if (editing)
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={ev => setText(ev.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onMouseDownCapture={ev => ev.stopPropagation()}
        className="nodrag nopan w-24 px-1 text-right tabular-nums bg-white border border-primary rounded-sm outline-none cursor-text"
        aria-label={ariaLabel}
        autoFocus
      />
    );

  return (
    <span
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      onClick={beginEdit}
      onKeyDown={handleDisplayKeyDown}
      onMouseDownCapture={handleDisplayMouseDown}
      className={`
        tabular-nums text-gray-500 whitespace-nowrap
        ${disabled ? "" : "nodrag cursor-text hover:text-gray-900 hover:underline decoration-dotted underline-offset-2"}
      `}
      title={disabled ? undefined : "click to edit"}
      aria-label={ariaLabel}
    >{display}</span>
  );
}
