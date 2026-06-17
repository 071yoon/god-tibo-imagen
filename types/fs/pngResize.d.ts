/**
 * Resize a PNG buffer with nearest-neighbor sampling.
 *
 * @param {Buffer} bytes - Source PNG bytes.
 * @param {string | number | null | undefined} pixelSize - Target size as N or WIDTHxHEIGHT.
 * @returns {Buffer} Resized PNG bytes, or the original bytes when no pixel size is provided.
 */
export function resizePngBytes(bytes: Buffer, pixelSize: string | number | null | undefined): Buffer;
/**
 * Process a PNG into a constrained pixel-art output.
 *
 * @param {Buffer} bytes - Source PNG bytes.
 * @param {{ pixelSize: string | number, paletteSize?: string | number, dither?: string, outline?: string }} options - Pixel-art processing options.
 * @returns {{ bytes: Buffer, metadata: { width: number, height: number, paletteSize: number, actualPaletteSize: number, dither: string, outline: string, outlineBoostedPixels: number } }} Processed PNG bytes and summary metadata.
 */
export function processPixelArtPngBytes(bytes: Buffer, options: {
    pixelSize: string | number;
    paletteSize?: string | number;
    dither?: string;
    outline?: string;
}): {
    bytes: Buffer;
    metadata: {
        width: number;
        height: number;
        paletteSize: number;
        actualPaletteSize: number;
        dither: string;
        outline: string;
        outlineBoostedPixels: number;
    };
};
/**
 * Upscale a PNG using nearest-neighbor sampling.
 *
 * @param {Buffer} bytes - Source PNG bytes.
 * @param {string | number} scale - Positive integer scale factor.
 * @returns {Buffer} Upscaled PNG bytes.
 */
export function upscalePngBytes(bytes: Buffer, scale: string | number): Buffer;
