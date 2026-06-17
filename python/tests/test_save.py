from __future__ import annotations

import pytest

from src.gti.errors import CodexError
from src.gti.save import save_image
from typing import cast


PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="


def test_save_image_writes_bytes(tmp_path):
    output = tmp_path / "nested" / "image.png"
    saved = save_image(result_base64=PNG_B64, output_path=output)
    assert saved == str(output)
    assert output.exists()
    assert output.read_bytes().startswith(b"\x89PNG")


def test_save_image_can_resize_for_pixel_art_workflows(tmp_path):
    output = tmp_path / "pixel.png"
    save_image(result_base64=PNG_B64, output_path=output, pixel_size="2x3")
    data = output.read_bytes()
    assert data.startswith(b"\x89PNG")
    assert int.from_bytes(data[16:20], "big") == 2
    assert int.from_bytes(data[20:24], "big") == 3


def test_save_image_can_apply_pixel_mode_and_preview(tmp_path):
    output = tmp_path / "pixel-mode.png"
    result = save_image(
        result_base64=PNG_B64,
        output_path=output,
        pixel_size=4,
        pixel_mode=True,
        pixel_palette=4,
        pixel_dither="bayer2",
        preview_upscale=3,
        return_metadata=True,
    )

    assert result["savedPath"] == str(output)
    assert result["previewPath"] == str(tmp_path / "pixel-mode.preview.png")
    assert result["pixelMetadata"] == {
        "width": 4,
        "height": 4,
        "paletteSize": 4,
        "actualPaletteSize": 1,
        "dither": "bayer2",
    }
    data = output.read_bytes()
    assert int.from_bytes(data[16:20], "big") == 4
    assert int.from_bytes(data[20:24], "big") == 4
    preview = (tmp_path / "pixel-mode.preview.png").read_bytes()
    assert int.from_bytes(preview[16:20], "big") == 12
    assert int.from_bytes(preview[20:24], "big") == 12


def test_save_image_rejects_data_url(tmp_path):
    with pytest.raises(Exception) as exc_info:
        save_image(result_base64="data:image/png;base64,abc", output_path=tmp_path / "x.png")
    error = cast(CodexError, exc_info.value)
    assert error.code == "UNSUPPORTED_DATA_URL"


def test_save_image_rejects_empty_payload(tmp_path):
    with pytest.raises(Exception) as exc_info:
        save_image(result_base64="   ", output_path=tmp_path / "x.png")
    error = cast(CodexError, exc_info.value)
    assert error.code == "EMPTY_IMAGE_PAYLOAD"
