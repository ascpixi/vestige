import * as tone from "tone";
import * as flow from "@xyflow/react";

import { VESTIGE_NODE_SERIALIZERS, VestigeNode } from "./nodes";
import { graphFromExisting } from "./graph";
import { promptToSaveFile } from "./environment";
import { marshalProject, unmarshalProject } from "./serializer";

/**
 * Renders a project in offline-mode (not in real-time), and prompts the user
 * to save it via the webview's native save dialog.
 */
export async function renderOffline(
    length: number,
    nodes: VestigeNode[],
    edges: flow.Edge[],
    reportProgress?: (percent: number) => void
) {
    const timeStart = performance.now();

    console.group(`🎹 Rendering ${length}s of audio.`);
    const marshalStart = performance.now();

    // We marshal/unmarshal the project in order to create clean-slate nodes. All
    // nodes must be created with the new context, and so we need to re-create the data
    // for each node.
    const marshalled = await marshalProject(nodes, edges, VESTIGE_NODE_SERIALIZERS);

    const buffer = await tone.Offline(async (ctx) => {
        const { nodes, edges } = await unmarshalProject(marshalled, VESTIGE_NODE_SERIALIZERS);
        console.log(`⌛ Marshalling/unmarshalling took ${performance.now() - marshalStart}ms`);
        
        const graph = graphFromExisting(nodes, edges);

        for (const node of graph.nodes) {
            await node.data.beforeRender?.();
        }

        let tickIdx = 0;
        const totalTicks = tone.Time(length).toTicks();
        const every = totalTicks / 100;

        const tickedNodes = graph.nodes.filter(x => x.data.onTick);

        ctx.on("tick", () => {
            const now = ctx.now();

            graph.traceGraph(now);
            tickedNodes.forEach(x => x.data.onTick!(now));
            
            tickIdx++;
            if (tickIdx % every) {
                reportProgress?.(tickIdx / totalTicks);
            }
        });
    }, length, 2, 48000);

    const audio = buffer.get()!;

    console.log("⌛ Actual rendering finished - now normalizing...");
    const normalizationStart = performance.now();

    let max = -1, min = 1;
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
        const channel = audio.getChannelData(ch);

        for (let i = 0; i < audio.length; i++) {
            const sample = channel[i];

            if (sample > max) {
                max = sample;
            }
    
            if (sample < min) {
                min = sample;
            }
        }
    }

    console.log(`⌛ Normalization took ${performance.now() - normalizationStart}ms`);
    console.groupEnd();

    const gain = 1 / Math.max(Math.abs(max), Math.abs(min));
    const wav = new Uint8Array(audioBufferToWave(buffer.get()!, gain));

    console.log(`✅ Rendering finished! Took ${(performance.now() - timeStart) / 1000}s in total.`);

    promptToSaveFile(
        wav,
        "untitled",
        "Microsoft wave file",
        "wav",
        "audio/wav"
    );
}

function audioBufferToWave(audio: AudioBuffer, gain: number = 1) {
    const totalSamples = audio.length * audio.numberOfChannels;

    const buffer = new ArrayBuffer(44 + totalSamples * 2);
    const view = new DataView(buffer);

    function writeString(offset: number, str: string) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + totalSamples * 2, true); // chunk length
    writeString(8, "WAVE"); // RIFF type
    writeString(12, "fmt "); // format chunk identifier
    view.setUint32(16, 16, true); // format chunk length
    view.setUint16(20, 1, true); // sample format (raw)
    view.setUint16(22, audio.numberOfChannels, true); // channel count
    view.setUint32(24, audio.sampleRate, true); // sample rate
    view.setUint32(28, audio.sampleRate * 4, true); // byte rate (sample rate * block align)
    view.setUint16(32, audio.numberOfChannels * 2, true); // block align (channel count * bytes per sample) 
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, "data"); // data chunk identifier
    view.setUint32(40, totalSamples * 2, true); // data chunk length

    let offset = 44;
    for (let i = 0; i < audio.length; i++) {
        for (let channel = 0; channel < audio.numberOfChannels; channel++) {
            const s = Math.max(-1, Math.min(1, audio.getChannelData(channel)[i] * gain));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            offset += 2;
        }
    }

    return buffer;
}