from __future__ import annotations


def build_pixel_art_prompt(
    *,
    prompt: str,
    pixel_size: str | int = 128,
    pixel_palette: str | int = 24,
    pixel_dither: str | None = "none",
) -> str:
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
            "- Use black or selectively darker colored outer outlines and darker colored inner outlines.",
            "- Use blocky cel shading and clustered highlights.",
            dither_line,
            "- No text, no readable letters, no watermark.",
        ]
    )
