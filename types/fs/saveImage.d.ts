/**
 * Decode a base64 PNG payload and save it to disk.
 *
 * @param {{ resultBase64: string, outputPath: string, rawOutputPath?: string, pixelSize?: string | number, pixelMode?: boolean, pixelPalette?: string | number, pixelDither?: string, pixelOutline?: string, previewUpscale?: string | number, returnMetadata?: boolean }} options - Base64 image payload and destination path.
 * @returns {Promise<string | { savedPath: string, rawPath: string | null, previewPath: string | null, pixelMetadata: unknown }>} The written output path by default, or output details when returnMetadata is true.
 */
export function saveImage({ resultBase64, outputPath, pixelSize, pixelMode, pixelPalette, pixelDither, pixelOutline, previewUpscale, returnMetadata }: {
    resultBase64: string;
    outputPath: string;
    rawOutputPath?: string;
    pixelSize?: string | number;
    pixelMode?: boolean;
    pixelPalette?: string | number;
    pixelDither?: string;
    pixelOutline?: string;
    previewUpscale?: string | number;
    returnMetadata?: boolean;
}): Promise<string | {
    savedPath: string;
    rawPath: string | null;
    previewPath: string | null;
    pixelMetadata: unknown;
}>;
