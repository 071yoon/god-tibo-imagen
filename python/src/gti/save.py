from __future__ import annotations

import base64
import re
from pathlib import Path

from .errors import make_error
from .resize import process_pixel_art_png_bytes, resize_png_bytes, upscale_png_bytes


def _assert_standard_base64(value: str) -> None:
    if re.match(r"^data:", value, re.IGNORECASE):
        raise make_error("Expected raw base64 PNG bytes, not a data URL.", code="UNSUPPORTED_DATA_URL")

    if not re.match(r"^[A-Za-z0-9+/=\s]+$", value):
        raise make_error("Image payload is not standard base64.", code="INVALID_BASE64")


def save_image(
    *,
    result_base64: str,
    output_path: str | Path,
    pixel_size: str | int | None = None,
    pixel_mode: bool = False,
    pixel_palette: str | int | None = None,
    pixel_dither: str | None = None,
    pixel_outline: str | None = None,
    preview_upscale: str | int | None = None,
    return_metadata: bool = False,
) -> str | dict[str, object]:
    _assert_standard_base64(result_base64)

    try:
        bytes_data = base64.b64decode(result_base64.strip(), validate=False)
    except Exception as error:
        raise make_error("Image payload is not standard base64.", code="INVALID_BASE64") from error

    if not bytes_data:
        raise make_error("Decoded image payload is empty.", code="EMPTY_IMAGE_PAYLOAD")

    pixel_metadata = None
    if pixel_mode:
        output_data, pixel_metadata = process_pixel_art_png_bytes(
            bytes_data,
            pixel_size=pixel_size or 128,
            palette_size=pixel_palette,
            dither=pixel_dither,
            outline=pixel_outline,
        )
    else:
        output_data = resize_png_bytes(bytes_data, pixel_size) if pixel_size else bytes_data

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(output_data)

    preview_path = None
    if preview_upscale:
        preview = output.with_name(f"{output.stem}.preview{output.suffix or '.png'}")
        preview.write_bytes(upscale_png_bytes(output_data, preview_upscale))
        preview_path = str(preview)

    result = {"savedPath": str(output), "previewPath": preview_path, "pixelMetadata": pixel_metadata}
    return result if return_metadata else str(output)
