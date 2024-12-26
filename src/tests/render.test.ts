import { describe, expect, it, vi } from "vitest";

import { AFTER_TOUR_PROJECT } from "../builtinProjects";
import { deserializeBase64Project } from "../serializer";
import { VESTIGE_NODE_SERIALIZERS } from "../nodes";
import { graphFromExisting } from "../graph";
import { renderOffline } from "../render";
import { promptToSaveFile } from "../environment";

vi.mock("../environment", () => ({
    promptToSaveFile: vi.fn()
}));

describe("renderer", () => {
    it("renders initial project", async () => {
        const deserialized = await deserializeBase64Project(
            AFTER_TOUR_PROJECT,
            VESTIGE_NODE_SERIALIZERS
        );

        const graph = graphFromExisting(deserialized.nodes, deserialized.edges);
        await renderOffline(
            10,
            graph.nodes,
            graph.edges
        );

        expect(promptToSaveFile).toHaveBeenCalledOnce();
        expect(promptToSaveFile).toHaveBeenCalledWith(
            expect.any(Uint8Array),
            "untitled",
            "Microsoft wave file", 
            "wav",
            "audio/wav"
        );
    });
})
