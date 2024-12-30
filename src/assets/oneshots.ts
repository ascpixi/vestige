// This file describes one-shot samples, such as drum hits.
// Not to be confused with the hit game OneShot (2016). 💡😺🥞

export const ONE_SHOT_BASE_URL = "/samples/oneshots";

export const ONE_SHOT_SAMPLES = {
    "707kick": { name: "TR-707 kick" },
    "707snare": { name: "TR-707 snare" },
    "707oh": { name: "TR-707 open hi-hat" },
    "707ch": { name: "TR-707 closed hi-hat" },
    "707cowbell": { name: "TR-707 cowbell" },
    "707crash": { name: "TR-707 crash cymbal" },
    "707ride": { name: "TR-707 ride cymbal" },
    "707tamb": { name: "TR-707 tambourine" },

    "808snare": { name: "TR-808 snare" },
    "808oh": { name: "TR-808 open hi-hat" },
    "808ch": { name: "TR-808 closed hi-hat" },
    "808crash": { name: "TR-808 crash cymbal" },
    "808cowbell": { name: "TR-808 cowbell" },
    
    "909kick": { name: "TR-909 kick" },
    "909snare": { name: "TR-909 snare" },
    "909clap": { name: "TR-909 clap" },
    "909ch": { name: "TR-909 closed hi-hat" },
    "909oh": { name: "TR-909 open hi-hat" },
    "909crash": { name: "TR-909 crash cymbal" },
    "909rim": { name: "TR-909 rim" },
    
    "amenkick1": { name: "Amen Break Kick 1" },
    "amenkick2": { name: "Amen Break Kick 2" },
    "amensnare": { name: "Amen Break Snare" },
    "amenhat": { name: "Amen Break Hi-Hat" },

    "wheelup": { name: "Wheel-Up Signal" },
}

export type OneShotSampleId = keyof typeof ONE_SHOT_SAMPLES;

export const ONE_SHOT_SAMPLE_IDS = Object.keys(ONE_SHOT_SAMPLES) as OneShotSampleId[];