import React from "react";

export function CheckboxField({ name, description, value, onChange }: {
  name: string,
  description: string,
  value: boolean,
  onChange: (x: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1 align-middle">
      <div className="flex gap-2">
        <input type="checkbox"
          checked={value}
          onChange={ev => onChange(ev.target.checked)}
          className="range range-primary range-xs"
        />

        <span className="font-semibold">{name}</span>
      </div>

      <span>{description}</span>
    </div>
  );
}