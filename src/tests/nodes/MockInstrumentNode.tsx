import * as flow from "@xyflow/react";

import { Automatable, AudioDestination, AudioGenerator, InstrumentNodeData, NoteEvent } from "../../graph";
import { makeNodeFactory } from "../../nodes/basis";

export class MockInstrumentNodeData extends InstrumentNodeData {
    /** The value controlled by `parameters["param-value"]`, returns `-1` if not set.  */
    automatedValue: number = -1;

    generator = new MockInstrumentAudioGenerator();
    parameters: {
        "param-value": Automatable
    } & Record<string, Automatable> = {
        "param-value": new Automatable(x => this.automatedValue = x)
    };
};
  
export class MockInstrumentAudioGenerator implements AudioGenerator {
    acceptedEvents: NoteEvent[][] = [];

    connectTo(_: AudioDestination): void { }
    disconnect() {}
    dispose() {}
    accept(events: NoteEvent[]): void {
        this.acceptedEvents.push(events);
    }
}

export type MockInstrumentNode = flow.Node<MockInstrumentNodeData, "mock-instrument">;
  
export const createMockInstrumentNode = makeNodeFactory(
    "mock-instrument",
    () => new MockInstrumentNodeData()
);
