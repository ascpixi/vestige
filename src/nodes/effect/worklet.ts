import * as tone from "tone";
import { ToneAudioWorklet } from "tone/build/esm/core/worklet/ToneAudioWorklet";

/**
 * Wraps an AudioWorklet processor with a single (mono) input and a stereo output,
 * exposing its parameters by name. Parameters can be set before the worklet is loaded.
 *
 * Subclasses provide the name of the processor via `_audioWorkletName`. It is called by
 * the constructor of `ToneAudioWorklet`, before any fields of the subclass are initialized,
 * so it must not depend on them.
 */
export abstract class ParameterizedWorklet extends ToneAudioWorklet<tone.ToneAudioNodeOptions> {
    readonly name: string = "ParameterizedWorklet";

    input = new tone.Gain({ context: this.context });
    output = new tone.Gain({ context: this.context });

    private node: AudioWorkletNode | null = null;
    private values: Record<string, number> = {};

    constructor() {
        super(tone.ToneAudioNode.getDefaults());

        this.workletOptions = {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            channelCount: 1,
            channelCountMode: "explicit"
        };
    }

    onReady(node: AudioWorkletNode) {
        this.node = node;
        tone.connect(this.input, node);
        tone.connect(node, this.output);

        for (const [key, value] of Object.entries(this.values)) {
            this.setParameter(key, value);
        }
    }

    /** Sets the parameter of the worklet with the given name. */
    setParameter(key: string, value: number) {
        this.values[key] = value;
        this.node?.parameters.get(key)?.setValueAtTime(value, 0);
    }

    dispose() {
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        return this;
    }
}
