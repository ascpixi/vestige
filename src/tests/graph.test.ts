import { describe, expect, it } from "vitest";
import * as flow from "@xyflow/react";
import { graphFromExisting, NOTE_INPUT_HID_MAIN, NOTE_OUTPUT_HID, SIGNAL_INPUT_HID_MAIN, SIGNAL_OUTPUT_HID, VALUE_OUTPUT_HID } from "../graph";
import { createPentatonicChordsNode } from "../nodes/note/PentatonicChordsNode";
import { createPickNoteNode } from "../nodes/note/PickNoteNode";
import { createFinalNode } from "../nodes/FinalNode";
import { uniqueId } from "../util";

import { createMockInstrumentNode } from "./nodes/MockInstrumentNode";
import { createLfoNode } from "../nodes/LfoNode";

function edge(src: flow.Node, srcHandle: string, dst: flow.Node, dstHandle: string): flow.Edge {
    return {
        id: uniqueId(),
        source: src.id,
        sourceHandle: srcHandle,
        target: dst.id,
        targetHandle: dstHandle
    }
}

describe("graphs", () => {
    it("forward notes", async () => {
        const penta = createPentatonicChordsNode(0, 0);
        const pick = createPickNoteNode(200, 0);
        const instrument = createMockInstrumentNode(400, 0);
        const final = createFinalNode(700, 0);
    
        const graph = graphFromExisting(
            [penta, pick, instrument, final],
            [
                edge(penta, NOTE_OUTPUT_HID, pick, NOTE_INPUT_HID_MAIN),
                edge(pick, NOTE_OUTPUT_HID, instrument, NOTE_INPUT_HID_MAIN),
                edge(instrument, SIGNAL_OUTPUT_HID, final, SIGNAL_INPUT_HID_MAIN)
            ]
        );
    
        graph.traceGraph(0);
    
        const gen = instrument.data.generator;
        expect(gen.acceptedEvents.length).toBe(1);
        expect(gen.acceptedEvents[0].length).toBe(1);
    });
    
    it("forward values", async () => {
        const penta = createPentatonicChordsNode(0, 0);
        const lfo = createLfoNode(0, 1000);
        const instrument = createMockInstrumentNode(200, 0);
        const final = createFinalNode(700, 0);
        
        const graph = graphFromExisting(
            [penta, lfo, instrument, final],
            [
                edge(penta, NOTE_OUTPUT_HID, instrument, NOTE_INPUT_HID_MAIN),
                edge(lfo, VALUE_OUTPUT_HID, instrument, "param-value"),
                edge(instrument, SIGNAL_OUTPUT_HID, final, SIGNAL_INPUT_HID_MAIN)
            ]
        );
    
        graph.traceGraph(0);
    
        expect(instrument.data.automatedValue).toBe(0.5); // sin(x) starts at 0.5
    });
});

