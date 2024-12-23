import { expect, test } from "vitest";
import { getPersistentData, mutatePersistentData, setPersistentData } from "../persistent";

test("stores persistent data", async () => {
    expect(getPersistentData()).toBeTruthy();
    expect(getPersistentData().tourComplete).toBe(false);

    setPersistentData({
        tourComplete: true,
        volume: 0.727
    });

    expect(getPersistentData().volume).toBe(0.727);
    expect(getPersistentData().tourComplete).toBe(true);

    mutatePersistentData({ volume: 0.42 });

    expect(getPersistentData().volume).toBe(0.42);
});
