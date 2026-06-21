/**
 * Create an animated GIF from a pixel PNG.
 *
 * @param {{ inputPath: string, outputPath: string, frames?: string | number, delay?: string | number, effect?: string }} options - Animation options.
 * @returns {Promise<{ inputPath: string, outputPath: string, width: number, height: number, frames: number, delay: number, effect: string }>} Animation summary.
 */
export function animatePixelPngToGif({ inputPath, outputPath, frames, delay, effect }: {
    inputPath: string;
    outputPath: string;
    frames?: string | number;
    delay?: string | number;
    effect?: string;
}): Promise<{
    inputPath: string;
    outputPath: string;
    width: number;
    height: number;
    frames: number;
    delay: number;
    effect: string;
}>;
