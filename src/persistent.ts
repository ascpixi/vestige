export interface PersistentData {
    tourComplete: boolean;
    volume: number;
}

function defaults(): PersistentData {
    return {
        tourComplete: false,
        volume: 0.5
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