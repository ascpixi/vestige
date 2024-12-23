import { expect, test } from "vitest";
import * as flow from "@xyflow/react";

import { VESTIGE_NODE_SERIALIZERS } from "../nodes";
import { deserializeBase64 } from "../serializer";
import { AFTER_TOUR_PROJECT } from "../builtinProjects";
import { assert } from "../util";
import { MIDI_NOTES } from "../audioUtil";

/**
 * A project, which should contain, when deserialized:
 * - a melody (pentatonic) node, where:
 *      - root note = F,
 *      - octave = 3,
 *      - pitch range = 6,
 *      - polyphony = 2,
 * - a synth node, where:
 *      - shape = sawtooth,
 * - an LFO node, where:
 *      - minimum = 0%,
 *      - maximum = 100%,
 * 
 * The connection diagram is as follows:
 * 
 *      MELODY -> SYNTH  -> FINAL OUTPUT
 *                  ^
 *                  |
 *             [fine-tune]
 *                  |
 *                 LFO
 */
const TEST_PROJ_1: string = (
    "AWWQK0_DUBiGu0GmuQn-RAVjg6LAIriEkKDf7py2Z22_0_U77VZDloDCoUhQJGwIFBYBmZ7mDxB-AoKQIWCEhBL0m-e9Xfu5TFlpqkjSQvLpEEZ6ihChZ6GwoNqsvTzh3G80Ia6GMJ1EkoHRpFp2LCMtCvQmo_Pj7OFjvIFiMmpfjGec_itU2MhXmUQRZmkIcQOxXIeeQVoD1RDLne3dvQMk1WkkF2QC9Daq8yicFah20u0UjmPqVIe4dRMvbPrhel1E-Vqg3ITf0JJJlLVC4N2xoC14c-gGjK7R2gTILfASssoQphV5-ruhv_gy-0xfDbf6C9ZZd_0JquwKMQALViThTTbvH_cv7456gAW3IqXwJZ8MYEq9XBPEimzSRrIdQxG4PNjlgHRmSvoU_z3TNQEpsln5hOiHL7tzoKd4Sf8XTwlSxLanSB5mJMF_TvrJzxFl8pv_BA=="
);

test("deserializes initial project", async () => {
    const deserialized = await deserializeBase64(
        AFTER_TOUR_PROJECT,
        VESTIGE_NODE_SERIALIZERS
    );

    expect(deserialized).toBeTruthy();
    expect(deserialized.edges.length).toBeGreaterThan(1);
    expect(deserialized.nodes.length).toBeGreaterThan(1);

    const finalNode = deserialized.nodes.find(x => x.data.nodeType == "FINAL");
    expect(finalNode).toBeTruthy();

    expect(deserialized.edges)
        .toSatisfy<flow.Edge[]>(
            x => x.some(y => y.target == finalNode!.id),
            "no incoming connections to the final node"
        );
});

test("deserializes test project 1", async () => {
    const deserialized = await deserializeBase64(
        TEST_PROJ_1,
        VESTIGE_NODE_SERIALIZERS
    );

    expect(deserialized).toBeTruthy();
    expect(deserialized.edges.length).toBe(3);
    expect(deserialized.nodes.length).toBe(4);

    const { edges, nodes } = deserialized;

    const melodyNode = nodes.find(x => x.type === "pentatonic-melody");
    expect(melodyNode).toBeTruthy();
    assert(melodyNode!.type === "pentatonic-melody");

    const lfoNode = nodes.find(x => x.type === "lfo");
    expect(lfoNode).toBeTruthy();
    assert(lfoNode!.type === "lfo");

    const synthNode = nodes.find(x => x.type === "synth");
    expect(synthNode).toBeTruthy();
    assert(synthNode!.type === "synth");

    const finalNode = nodes.find(x => x.type === "final");
    expect(finalNode).toBeTruthy();
    assert(finalNode!.type === "final");

    function expectConnection(from: string, to: string, display: string) {
        expect(edges)
            .toSatisfy<flow.Edge[]>(
                x => x.some(y => y.source == from && y.target == to),
                `no connection found: ${display}`
            );
    }

    expectConnection(melodyNode!.id, synthNode!.id, "melody -> synth");
    expectConnection(lfoNode!.id, synthNode!.id, "LFO -> synth");
    expectConnection(synthNode!.id, finalNode!.id, "synth -> final");

    const melodyNodeGen = melodyNode!.data.generator;
    expect(melodyNodeGen.rootNote).toBe(MIDI_NOTES.F);
    expect(melodyNodeGen.octave).toBe(3);
    expect(melodyNodeGen.pitchRange).toBe(6);
    expect(melodyNodeGen.polyphony).toBe(2);

    expect(synthNode!.data.generator.waveform).toBe("sawtooth");

    expect(lfoNode!.data.generator.min).toBe(0);
    expect(lfoNode!.data.generator.max).toBe(1);
});