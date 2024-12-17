export interface PersistentData {
    tourComplete: boolean;
}

function defaults(): PersistentData {
    return {
        tourComplete: false
    };
}

export function getPersistentData() {
    const json = localStorage.getItem("vestige");
    
    if (json == null) {
        setPersistentData(defaults());
        return defaults();
    }

    return JSON.parse(json) as PersistentData;
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