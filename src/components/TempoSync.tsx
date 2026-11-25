import { RiMusic2Line } from "@remixicon/react";

import { clampBpm, NOTE_DIVISIONS } from "../transport";

import { EditableValue } from "./EditableValue";

/**
 * A small toggle that switches a time-based parameter between free values, and
 * note divisions relative to the tempo of its node.
 */
export function SyncToggle({ synced, onChange }: {
  synced: boolean,
  onChange: (synced: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!synced)}
      onMouseDownCapture={ev => ev.stopPropagation()}
      className={`
        nodrag flex items-center justify-center w-5 h-5 -my-1 rounded-sm transition-colors cursor-pointer
        ${
          synced
            ? "text-primary bg-primary/10 hover:bg-primary/20"
            : "text-gray-400 hover:text-gray-900 hover:bg-gray-100"
        }
      `}
      title={synced ? "Synced to tempo (click to use free values)" : "Sync to tempo"}
      aria-pressed={synced}
    >
      <RiMusic2Line className="w-3.5 h-3.5"/>
    </button>
  );
}

/**
 * A field that lets the user pick a note division and a tempo, displayed instead of
 * a slider when a parameter is synced to a tempo.
 */
export function DivisionField({
  name, value, onChange, bpm, onBpmChange, onSyncedChange, minBeats, maxBeats
}: {
  /** The name of the input field. */
  name: string,

  /** The ID of the currently selected note division. */
  value: string,

  /** Invoked with the ID of the new division when the user selects it. */
  onChange: (id: string) => void,

  /** The tempo that the division is relative to, in beats per minute. */
  bpm: number,

  /** Invoked when the user changes the tempo. */
  onBpmChange: (bpm: number) => void,

  /** If specified, a toggle that disables tempo sync will be displayed. */
  onSyncedChange?: (synced: boolean) => void,

  /** If specified, divisions shorter than this amount of beats are not offered. */
  minBeats?: number,

  /** If specified, divisions longer than this amount of beats are not offered. */
  maxBeats?: number
}) {
  const divisions = NOTE_DIVISIONS.filter(x =>
    x.beats >= (minBeats ?? 0) && x.beats <= (maxBeats ?? Infinity)
  );

  return (
    <div className="flex flex-col gap-1 align-middle">
      <div className="flex justify-between items-center gap-4">
        <span className="font-semibold">{name}</span>
        { !onSyncedChange ? <></> : <SyncToggle synced={true} onChange={onSyncedChange}/> }
      </div>

      <div className="flex gap-2">
        <select
          value={value}
          onChange={ev => onChange(ev.target.value)}
          className="nodrag select select-primary select-sm grow min-w-0"
          aria-label={name}
        >
          { divisions.map(x => <option key={x.id} value={x.id}>{x.label}</option>) }
        </select>

        <div
          className="flex items-center px-3 h-8 shrink-0 rounded-field border border-base-300"
          title="Tempo of this node - click to edit"
        >
          <EditableValue
            display={`${bpm} BPM`}
            editText={`${bpm}`}
            onCommit={x => onBpmChange(clampBpm(Math.round(x * 100) / 100))}
            ariaLabel={`${name} tempo`}
          />
        </div>
      </div>
    </div>
  );
}
