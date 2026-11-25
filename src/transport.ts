import { clamp } from "./util";

/**
 * Represents a musical note division, relative to the tempo of a node.
 */
export interface NoteDivision {
    /** The identifier of the division, used for serialization. */
    id: string;

    /** A user-friendly label of the division. */
    label: string;

    /** The length of the division, in beats (quarter notes). */
    beats: number;
}

/** Represents an object with a parameter that can be synced to a tempo. */
export interface TempoSynced {
    /** If `true`, the parameter follows `division` instead of its free value. */
    sync: boolean;

    /** The identifier of the note division the parameter is set to. */
    division: string;

    /** The tempo that `division` is relative to, in beats per minute. */
    bpm: number;
}

/** All note divisions available for tempo-synchronized parameters, from longest to shortest. */
export const NOTE_DIVISIONS: NoteDivision[] = [
    { id: "8bar", label: "8 bars", beats: 32 },
    { id: "4bar", label: "4 bars", beats: 16 },
    { id: "2bar", label: "2 bars", beats: 8 },
    { id: "1bar", label: "1 bar", beats: 4 },
    { id: "1/2.", label: "1/2 dotted", beats: 3 },
    { id: "1/2", label: "1/2", beats: 2 },
    { id: "1/2t", label: "1/2 triplet", beats: 4 / 3 },
    { id: "1/4.", label: "1/4 dotted", beats: 1.5 },
    { id: "1/4", label: "1/4", beats: 1 },
    { id: "1/4t", label: "1/4 triplet", beats: 2 / 3 },
    { id: "1/8.", label: "1/8 dotted", beats: 0.75 },
    { id: "1/8", label: "1/8", beats: 0.5 },
    { id: "1/8q", label: "1/8 quintuplet", beats: 2 / 5 },
    { id: "1/8t", label: "1/8 triplet", beats: 1 / 3 },
    { id: "1/8s", label: "1/8 septuplet", beats: 2 / 7 },
    { id: "1/16.", label: "1/16 dotted", beats: 0.375 },
    { id: "1/16", label: "1/16", beats: 0.25 },
    { id: "1/16q", label: "1/16 quintuplet", beats: 1 / 5 },
    { id: "1/16t", label: "1/16 triplet", beats: 1 / 6 },
    { id: "1/16s", label: "1/16 septuplet", beats: 1 / 7 },
    { id: "1/32", label: "1/32", beats: 0.125 }
];

export const MIN_BPM = 20;
export const MAX_BPM = 300;

/** The tempo that new nodes start with, in beats per minute. */
export const DEFAULT_BPM = 120;

// Every node keeps its own tempo, but all of them share a single clock that starts at
// the beginning of playback. We align all grids to that point, which keeps nodes with
// different tempos in phase with each other - e.g. 120 BPM and 60 BPM meet on every beat
// of the latter, and 90 BPM against 120 BPM forms a 3:4 polyrhythm.

/** Clamps a tempo to the supported range. */
export function clampBpm(bpm: number) {
    return clamp(bpm, MIN_BPM, MAX_BPM);
}

/** Gets the length of the note division with the given ID at the given tempo, in seconds. */
export function divisionLength(id: string, bpm: number) {
    // Projects saved by newer versions might use divisions we don't know about. We treat
    // these as quarter notes.
    const beats = NOTE_DIVISIONS.find(x => x.id == id)?.beats ?? 1;
    return beats * (60 / bpm);
}

/** Gets the note division closest to the given length (in seconds) at the given tempo. */
export function closestDivision(seconds: number, bpm: number) {
    // We perceive lengths logarithmically: twice as long is as far away as half as long.
    function distance(division: NoteDivision) {
        return Math.abs(Math.log(division.beats * (60 / bpm) / seconds));
    }

    return NOTE_DIVISIONS
        .reduce((best, division) => distance(division) < distance(best) ? division : best)
        .id;
}
