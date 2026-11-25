import { describe, expect, it, vi } from "vitest";
import * as flow from "@xyflow/react";

import { VESTIGE_NODE_SERIALIZERS } from "../nodes";
import { graphFromExisting, NOTE_INPUT_HID_MAIN, NOTE_OUTPUT_HID, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, VALUE_OUTPUT_HID } from "../graph";
import { deserializeProject, serializeProject } from "../serializer";
import { renderOffline } from "../render";
import { promptToSaveFile } from "../environment";
import { assert, uniqueId } from "../util";

import { createFinalNode } from "../nodes/FinalNode";
import { createScopeNode } from "../nodes/ScopeNode";
import { createNoiseNode } from "../nodes/value/NoiseNode";
import { createValueNode } from "../nodes/value/ValueNode";
import { createMapRangeNode } from "../nodes/value/MapRangeNode";
import { createShimmerNode } from "../nodes/effect/ShimmerNode";
import { createSynthNode, SynthNodeData, SynthNodeSerializer } from "../nodes/instrument/SynthNode";
import { createAudioPlayerNode } from "../nodes/instrument/AudioPlayerNode";
import { createPentatonicChordsNode } from "../nodes/note/PentatonicChordsNode";

vi.mock("../environment", () => ({
    promptToSaveFile: vi.fn()
}));

function edge(
    src: flow.Node,
    srcHandle: string,
    dst: flow.Node,
    dstHandle: string
): flow.Edge {
    return {
        id: uniqueId(),
        source: src.id,
        sourceHandle: srcHandle,
        target: dst.id,
        targetHandle: dstHandle
    }
}

describe("nodes", () => {
    it("round-trips new node types and collapsed state", async () => {
        const final = createFinalNode(0, 0);
        const noise = createNoiseNode(0, 0);
        const value = createValueNode(0, 0);
        const mapRange = createMapRangeNode(0, 0);
        const shimmer = createShimmerNode(0, 0);
        const scope = createScopeNode(0, 0);

        noise.data.generator.rate = 3;
        value.data.generator.value = 0.25;
        mapRange.data.generator.interpolation = "STEPPED";
        shimmer.data.effect.size = 0.2;
        shimmer.data.effect.shift = 7;
        scope.data.mode = "SPECTROGRAM";
        shimmer.data.collapsed = true;

        const nodes = [final, noise, value, mapRange, shimmer, scope];
        const edges = [
            edge(noise, VALUE_OUTPUT_HID, mapRange, "param-value"),
            edge(shimmer, SIGNAL_OUTPUT_HID, scope, SIGNAL_INPUT_HID_MAIN),
            edge(scope, SIGNAL_OUTPUT_HID, final, SIGNAL_INPUT_HID_MAIN)
        ];

        const graph = graphFromExisting(nodes, edges);
        const bytes = await serializeProject(graph.nodes, graph.edges, VESTIGE_NODE_SERIALIZERS);
        const result = await deserializeProject(bytes, VESTIGE_NODE_SERIALIZERS);

        function find<T extends string>(type: T) {
            const node = result.nodes.find(x => x.type == type);
            assert(node && node.type == type);
            return node as Extract<typeof result.nodes[number], { type: T }>;
        }

        expect(find("noise").data.generator.rate).toBe(3);
        expect(find("value").data.generator.value).toBe(0.25);
        expect(find("map-range").data.generator.interpolation).toBe("STEPPED");
        expect(find("map-range").data.parameters["param-value"].controlledBy).toBe(noise.id);
        expect(find("shimmer").data.effect.size).toBeCloseTo(0.2);
        expect(find("shimmer").data.effect.shift).toBe(7);
        expect(find("shimmer").data.collapsed).toBe(true);
        expect(find("scope").data.mode).toBe("SPECTROGRAM");
        expect(find("noise").data.collapsed).toBeFalsy();

        // We don't want to leave audio nodes running in the real-time context.
        shimmer.data.effect.dispose();
        scope.data.effect.dispose();
        result.nodes.forEach(x => (x.data as { effect?: { dispose(): void } }).effect?.dispose());
    });

    it("renders shimmer and audio player nodes", async () => {
        const final = createFinalNode(0, 0);
        const chords = createPentatonicChordsNode(0, 0);
        const synth = createSynthNode(0, 0);
        const shimmer = createShimmerNode(0, 0);
        const player = createAudioPlayerNode(0, 0);

        const response = await fetch("/samples/oneshots/707ch.wav");
        const wav = new Uint8Array(await response.arrayBuffer());
        player.data.generator.setFile(wav, "707ch.wav");
        await player.data.generator.loadPromise;
        expect(player.data.generator.peaks).toBeTruthy();

        const graph = graphFromExisting(
            [final, chords, synth, shimmer, player],
            [
                edge(chords, NOTE_OUTPUT_HID, synth, NOTE_INPUT_HID_MAIN),
                edge(synth, SIGNAL_OUTPUT_HID, shimmer, SIGNAL_INPUT_HID_MAIN),
                edge(shimmer, SIGNAL_OUTPUT_HID, final, SIGNAL_INPUT_HID_MAIN),
                edge(player, SIGNAL_OUTPUT_HID, final, SIGNAL_INPUT_HID_MAIN)
            ]
        );

        await renderOffline(1, graph.nodes, graph.edges);

        expect(promptToSaveFile).toHaveBeenCalled();
        const wavOut = vi.mocked(promptToSaveFile).mock.lastCall![0];
        expect(wavOut.length).toBeGreaterThan(44);

        // If the feedback network blew up, we'd only get NaNs or silence here.
        const view = new DataView(wavOut.buffer, wavOut.byteOffset);
        let nonZero = 0;
        for (let i = 44; i < wavOut.length; i += 2) {
            if (view.getInt16(i, true) != 0) {
                nonZero++;
            }
        }

        expect(nonZero).toBeGreaterThan(1000);

        synth.data.generator.dispose();
        shimmer.data.effect.dispose();
        player.data.generator.dispose();
    });

    it("migrates legacy synth envelopes and round-trips ADSR values", async () => {
        const serializer = new SynthNodeSerializer();

        const legacy = serializer.serialize(new SynthNodeData()) as any;
        delete legacy.e;
        legacy.c = "smooth";
        legacy.a = 0.5;

        const migrated = await serializer.deserialize(legacy);
        expect(migrated.envelope.attack).toBeCloseTo(2.1);
        expect(migrated.envelope.sustain).toBe(1);
        expect(migrated.envelope.release).toBeCloseTo(3.15);

        const data = new SynthNodeData();
        data.envelope = { attack: 0.2, decay: 0.4, sustain: 0.5, release: 1.5 };

        const serialized = serializer.serialize(data);
        expect(serialized).not.toHaveProperty("c");

        const restored = await serializer.deserialize(serialized);
        expect(restored.envelope).toEqual(data.envelope);
    });
});
