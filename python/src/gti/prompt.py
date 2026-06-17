from __future__ import annotations

from .errors import make_error


def build_pixel_art_prompt(
    *,
    prompt: str,
    pixel_size: str | int = 128,
    pixel_palette: str | int = 24,
    pixel_dither: str | None = "none",
    pixel_outline: str | None = "soft",
) -> str:
    outline = (pixel_outline or "soft").lower()
    if outline not in ("none", "soft", "strong"):
        raise make_error(f"Invalid pixel outline: {pixel_outline}. Supported values: none, soft, strong.")

    if outline == "strong":
        outline_line = "- Use a strong readable 1-pixel dark outline, high-contrast silhouette, and darker inner contour lines around the face, hands, clothing, props, and key objects."
    elif outline == "none":
        outline_line = "- Do not add heavy outlines; keep edges readable with clean color separation."
    else:
        outline_line = "- Use a clear readable 1-pixel dark outline and darker inner contour lines where they improve silhouette clarity."
    dither_line = (
        "- Use subtle ordered dithering only in shadows, backgrounds, or material texture; never dither skin, faces, or the main focal surface."
        if pixel_dither and pixel_dither != "none"
        else "- Prefer clean flat color clusters over dithering unless necessary."
    )
    return "\n".join(
        [
            prompt,
            "",
            "Pixel-art production constraints:",
            f"- Compose for a native {pixel_size} pixel-art canvas, not for a smooth high-resolution illustration.",
            f"- Use a limited palette of about {pixel_palette} colors.",
            "- No anti-aliasing, no soft blur, no photographic texture, no smooth gradients.",
            "- Use crisp square pixels, readable silhouette, clean 1-pixel clusters, and intentional pixel placement.",
            "- Keep faces and skin as clean flat color clusters; avoid freckles, speckles, noisy pixels, or dithering on facial features.",
            "- Avoid double pixels on outlines and avoid uneven jaggies.",
            "- Straight lines must keep a consistent stair-step slope.",
            "- Curves must use gradually increasing or decreasing pixel run lengths.",
            outline_line,
            "- Avoid pale low-contrast outlines on the main subject.",
            "- Use blocky cel shading and clustered highlights.",
            dither_line,
            "- No text, no readable letters, no watermark.",
        ]
    )
