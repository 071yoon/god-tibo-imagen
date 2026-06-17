/**
 * Add pixel-art production constraints to a user prompt.
 *
 * @param {{ prompt: string, pixelSize?: string | number, pixelPalette?: string | number, pixelDither?: string }} options - Prompt inputs.
 * @returns {string} Prompt with pixel-art constraints appended.
 */
export function buildPixelArtPrompt({ prompt, pixelSize, pixelPalette, pixelDither }: {
    prompt: string;
    pixelSize?: string | number;
    pixelPalette?: string | number;
    pixelDither?: string;
}): string;
