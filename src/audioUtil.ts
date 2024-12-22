import { Frequency } from "tone";
import { Frequency as FrequencyUnit }  from "tone/build/esm/core/type/Units";

import { toAugmented } from "./collections";

/**
 * Represents either the major (Ionian) or minor (Aeolian) mode.
 */
export type ScaleMode = "MAJOR" | "MINOR";

/**
 * Provides offsets, in semitones, from the base key, that form the intervals
 * of the major pentatonic scale.
 */
export const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];

/**
 * Provides offsets, in semitones, from the base key, that form the intervals
 * of the minor pentatonic scale.
 */
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10];

/** MIDI note numbers for all notes in the chromatic scale. An `s` suffix represents a sharp (#). */
export const MIDI_NOTES = {
    /** C  */ C : 0,
    /** C# */ Cs: 1,
    /** D  */ D : 2,
    /** D# */ Ds: 3,
    /** E  */ E : 4,
    /** E# */ Es: 5,
    /** F  */ F : 6,
    /** F# */ Fs: 7,
    /** G  */ G : 8,
    /** G# */ Gs: 9,
    /** A  */ A : 10,
    /** A# */ As: 11,
    /** B  */ B : 12
} as const;

/** Represents all notes in the chromatic scale. */
export const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * Represents a note in the chromatic scale - or, in other words, an element
 * of the `CHROMATIC_SCALE` array.
 */
export type ChromaticNote = typeof CHROMATIC_SCALE[number];

/**
 * Gets a collection of notes in a given scale (as identified by its intervals
 * in the form of semitone offsets from the root note), spanning `pitchRange`
 * semitones.
 * 
 * @param intervals The intervals of the scale, represented by semitone offsets from the root note.
 * @param rootNote The MIDI note number for the root note. Should be no greater than 12.
 * @param octave The octave to transpose the entire scale by.
 * @param pitchRange The amount of intervals that the resulting scale should contain.
 * @returns The scale, represented by MIDI note numbers, with its length equal to `pitchRange`.
 */
export function getHarmony(
    intervals: number[],
    rootNote: number,
    octave: number,
    pitchRange: number
) {
    return toAugmented(intervals)
        .map(x => x + rootNote) // transpose to the right key
        .map(x => x + (octave * 12)) // transpose to the right octave
        .repeat( // repeat to fill pitchRange
            Math.max(1, pitchRange / intervals.length),
            (x, _, chunk) => x + (chunk * 12)
        )
        .take(pitchRange)
        .collect();
}

/** Converts an octave to cents, where an octave is equal to 1200 cents. */
export function octToCents(octaves: number) {
    return octaves * 1200;
}

/** Converts a MIDI pitch to a note name (e.g. `C#5`). */
export function midiToName(midi: number) {
    if (midi < 0 || midi > 127 || !Number.isInteger(midi))
        throw new Error("Invalid MIDI pitch. Must be an integer between 0 and 127.");

    const octave = Math.floor(midi / 12) - 1; // MIDI 0 is C-1
    const note = CHROMATIC_SCALE[midi % 12];
    return `${note}${octave}`;
}

/**
 * Converts a Tone.js `Frequency` object to a regular number,
 * representing the frequency in Hz.
 */
export function toneFreq(x: FrequencyUnit): number {
    if (typeof x === "number")
        return x;

    return Frequency(x).toFrequency();
}
