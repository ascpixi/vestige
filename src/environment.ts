/**
 * Returns `true` if Vestige is running as a Tauri desktop application.
 */
export function isTauri(): boolean {
    return "isTauri" in window && !!window.isTauri;
}

export async function promptToSaveFile(data: Uint8Array, filename: string, fileType: string, extension: string) {
    if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeFile } = await import("@tauri-apps/plugin-fs");

        const filePath = await save({
            filters: [{
                name: fileType,
                extensions: [extension]
            }],
            defaultPath: `${filename}.${extension}`
        });

        if (filePath) {
            await writeFile(filePath, data);
        }
    } else {
        const blob = new Blob([data], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.${extension}`;

        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}