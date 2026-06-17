// @ts-nocheck

/**
 * Add pixel-art production constraints to a user prompt.
 *
 * @param {{ prompt: string, pixelSize?: string | number, pixelPalette?: string | number, pixelDither?: string, pixelOutline?: string }} options - Prompt inputs.
 * @returns {string} Prompt with pixel-art constraints appended.
 */
export function buildPixelArtPrompt({
  prompt,
  pixelSize = 128,
  pixelPalette = 24,
  pixelDither = 'none',
  pixelOutline = 'soft'
}) {
  const outline = String(pixelOutline || 'soft').toLowerCase();
  if (!['none', 'soft', 'strong'].includes(outline)) {
    throw new Error(`Invalid pixel outline: ${pixelOutline}. Supported values: none, soft, strong.`);
  }
  const outlineLine = outline === 'strong'
    ? '- Use a strong readable 1-pixel dark outline, high-contrast silhouette, and darker inner contour lines around the face, hands, clothing, props, and key objects.'
    : outline === 'none'
      ? '- Do not add heavy outlines; keep edges readable with clean color separation.'
      : '- Use a clear readable 1-pixel dark outline and darker inner contour lines where they improve silhouette clarity.';

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
    outlineLine,
    '- Avoid pale low-contrast outlines on the main subject.',
    '- Use blocky cel shading and clustered highlights.',
    pixelDither && pixelDither !== 'none'
      ? '- Use subtle ordered dithering only in shadows, backgrounds, or material texture; never dither skin, faces, or the main focal surface.'
      : '- Prefer clean flat color clusters over dithering unless necessary.',
    '- No text, no readable letters, no watermark.'
  ].join('\n');
}
