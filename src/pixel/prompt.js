// @ts-nocheck

/**
 * Add pixel-art production constraints to a user prompt.
 *
 * @param {{ prompt: string, pixelSize?: string | number, pixelPalette?: string | number, pixelDither?: string }} options - Prompt inputs.
 * @returns {string} Prompt with pixel-art constraints appended.
 */
export function buildPixelArtPrompt({ prompt, pixelSize = 128, pixelPalette = 24, pixelDither = 'none' }) {
  return [
    prompt,
    '',
    'Pixel-art production constraints:',
    `- Compose for a native ${pixelSize} pixel-art canvas, not for a smooth high-resolution illustration.`,
    `- Use a limited palette of about ${pixelPalette} colors.`,
    '- No anti-aliasing, no soft blur, no photographic texture, no smooth gradients.',
    '- Use crisp square pixels, readable silhouette, clean 1-pixel clusters, and intentional pixel placement.',
    '- Keep faces and skin as clean flat color clusters; avoid freckles, speckles, noisy pixels, or dithering on facial features.',
    '- Avoid double pixels on outlines and avoid uneven jaggies.',
    '- Straight lines must keep a consistent stair-step slope.',
    '- Curves must use gradually increasing or decreasing pixel run lengths.',
    '- Use black or selectively darker colored outer outlines and darker colored inner outlines.',
    '- Use blocky cel shading and clustered highlights.',
    pixelDither && pixelDither !== 'none'
      ? '- Use subtle ordered dithering only in shadows, backgrounds, or material texture; never dither skin, faces, or the main focal surface.'
      : '- Prefer clean flat color clusters over dithering unless necessary.',
    '- No text, no readable letters, no watermark.'
  ].join('\n');
}
