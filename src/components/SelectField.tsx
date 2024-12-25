import { PropsWithChildren } from "react";

import { PlainField } from "./PlainField";

export function SelectField({ name, description, value, onChange, children }: PropsWithChildren<{
  name: string,
  description: string,
  value: string | number,
  onChange: (x: string) => void
}>) {
  return (
    <PlainField name={name} description={description}>
      <select
        value={value} onChange={ev => onChange(ev.target.value)}
        className="select select-primary select-sm w-full max-w-xs"
        aria-label={`${name}: ${description}`}
      >
        {children}
      </select>
    </PlainField>
  );
}