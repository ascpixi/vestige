export function CheckboxField({ name, description, value, onChange }: {
  name: string,
  description?: string,
  value: boolean,
  onChange: (x: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1 align-middle">
      <label className="flex gap-2 items-center cursor-pointer w-fit">
        <input type="checkbox"
          checked={value}
          onChange={ev => onChange(ev.target.checked)}
          className="nodrag checkbox checkbox-primary checkbox-sm"
        />

        <span className="font-semibold">{name}</span>
      </label>

      { !description ? <></> : <span className="text-gray-500">{description}</span> }
    </div>
  );
}