/**
 * Determines which mouse button pans the canvas. With `"LEFT"`, nodes are selected by
 * dragging while holding Shift. With `"MIDDLE"`, dragging with the left mouse button selects.
 */
export type PanMode = "LEFT" | "MIDDLE";

/** Determines whether the scroll wheel zooms (`"ZOOM"`), or pans (`"PAN"`) the canvas. */
export type ScrollMode = "ZOOM" | "PAN";

export interface PersistentData {
    tourComplete: boolean;
    volume: number;
    panMode: PanMode;
    scrollMode: ScrollMode;
}

function defaults(): PersistentData {
    return {
        tourComplete: false,
        volume: 0.5,
        panMode: "LEFT",
        scrollMode: "ZOOM"
    };
}

export function getPersistentData() {
    const json = localStorage.getItem("vestige");
    
    if (json == null) {
        setPersistentData(defaults());
        return defaults();
    }

    return {
        ...defaults(),
        ...JSON.parse(json)
    } as PersistentData;
}

export function setPersistentData(data: PersistentData) {
    localStorage.setItem("vestige", JSON.stringify(data));
}

export function mutatePersistentData(toMerge: Partial<PersistentData>) {
    setPersistentData({
        ...getPersistentData(),
        ...toMerge
    } as PersistentData);
}