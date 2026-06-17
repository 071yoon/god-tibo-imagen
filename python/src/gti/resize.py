from __future__ import annotations

import struct
import zlib

from .errors import make_error

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_PIXEL_DIMENSION = 8192
CHANNELS_BY_COLOR_TYPE = {
    0: 1,
    2: 3,
    4: 2,
    6: 4,
}
BAYER_MATRICES = {
    "none": None,
    "bayer2": ((0, 2), (3, 1)),
    "bayer4": ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5)),
}


def _parse_pixel_size(pixel_size: str | int | None) -> tuple[int, int] | None:
    if pixel_size is None or pixel_size == "":
        return None

    value = str(pixel_size).strip().lower()
    parts = value.split("x", 1)
    if len(parts) == 1:
        width_text = height_text = parts[0]
    else:
        width_text, height_text = parts

    if not width_text.isdigit() or not height_text.isdigit():
        raise make_error(f"Invalid pixel size: {pixel_size}. Use N or WIDTHxHEIGHT, for example 32 or 64x64.")

    width = int(width_text)
    height = int(height_text)
    if width < 1 or height < 1 or width > MAX_PIXEL_DIMENSION or height > MAX_PIXEL_DIMENSION:
        raise make_error(
            f"Invalid pixel size: {pixel_size}. Dimensions must be between 1 and {MAX_PIXEL_DIMENSION}."
        )
    return width, height


def _read_chunks(data: bytes) -> list[tuple[str, bytes]]:
    if not data.startswith(PNG_SIGNATURE):
        raise make_error("Expected a PNG image.")

    chunks: list[tuple[str, bytes]] = []
    offset = len(PNG_SIGNATURE)
    while offset < len(data):
        if offset + 8 > len(data):
            raise make_error("Invalid PNG chunk header.")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8].decode("ascii")
        data_start = offset + 8
        data_end = data_start + length
        if data_end + 4 > len(data):
            raise make_error("Invalid PNG chunk length.")
        chunks.append((chunk_type, data[data_start:data_end]))
        offset = data_end + 4
        if chunk_type == "IEND":
            break
    return chunks


def _paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _unfilter_scanlines(data: bytes, width: int, height: int, channels: int) -> bytearray:
    stride = width * channels
    expected = height * (stride + 1)
    if len(data) < expected:
        raise make_error("PNG image data is shorter than expected.")

    output = bytearray(height * stride)
    input_offset = 0
    for y in range(height):
        filter_type = data[input_offset]
        input_offset += 1
        row_offset = y * stride
        prev_row_offset = row_offset - stride

        for x in range(stride):
            raw = data[input_offset + x]
            left = output[row_offset + x - channels] if x >= channels else 0
            up = output[prev_row_offset + x] if y > 0 else 0
            up_left = output[prev_row_offset + x - channels] if y > 0 and x >= channels else 0

            if filter_type == 0:
                value = raw
            elif filter_type == 1:
                value = raw + left
            elif filter_type == 2:
                value = raw + up
            elif filter_type == 3:
                value = raw + ((left + up) // 2)
            elif filter_type == 4:
                value = raw + _paeth_predictor(left, up, up_left)
            else:
                raise make_error(f"Unsupported PNG filter type: {filter_type}.")
            output[row_offset + x] = value & 0xFF

        input_offset += stride

    return output


def _resize_nearest(
    pixels: bytearray,
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
    channels: int,
) -> bytearray:
    output = bytearray(target_width * target_height * channels)
    for y in range(target_height):
        source_y = min(source_height - 1, (y * source_height) // target_height)
        for x in range(target_width):
            source_x = min(source_width - 1, (x * source_width) // target_width)
            source_offset = (source_y * source_width + source_x) * channels
            target_offset = (y * target_width + x) * channels
            output[target_offset : target_offset + channels] = pixels[source_offset : source_offset + channels]
    return output


def _resize_area(
    pixels: bytearray,
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
    channels: int,
) -> bytearray:
    output = bytearray(target_width * target_height * channels)
    for y in range(target_height):
        source_y0 = (y * source_height) // target_height
        source_y1 = max(source_y0 + 1, ((y + 1) * source_height + target_height - 1) // target_height)
        for x in range(target_width):
            source_x0 = (x * source_width) // target_width
            source_x1 = max(source_x0 + 1, ((x + 1) * source_width + target_width - 1) // target_width)
            sums = [0] * channels
            count = 0
            for sy in range(source_y0, min(source_y1, source_height)):
                for sx in range(source_x0, min(source_x1, source_width)):
                    source_offset = (sy * source_width + sx) * channels
                    for channel in range(channels):
                        sums[channel] += pixels[source_offset + channel]
                    count += 1
            target_offset = (y * target_width + x) * channels
            for channel in range(channels):
                output[target_offset + channel] = round(sums[channel] / count)
    return output


def _parse_positive_int(value: str | int | None, name: str, fallback: int) -> int:
    if value is None or value == "":
        return fallback
    try:
        parsed = int(value)
    except ValueError as error:
        raise make_error(f"Invalid {name}: {value}. Expected a positive integer.") from error
    if parsed < 1:
        raise make_error(f"Invalid {name}: {value}. Expected a positive integer.")
    return parsed


def _parse_palette_size(value: str | int | None) -> int:
    palette_size = _parse_positive_int(value, "palette size", 24)
    if palette_size < 2 or palette_size > 256:
        raise make_error(f"Invalid palette size: {value}. Expected 2-256 colors.")
    return palette_size


def _parse_dither(value: str | None) -> str:
    dither = (value or "none").lower()
    if dither not in BAYER_MATRICES:
        raise make_error(f"Invalid pixel dither: {value}. Supported values: none, bayer2, bayer4.")
    return dither


def _parse_outline(value: str | None) -> str:
    outline = (value or "soft").lower()
    if outline not in ("none", "soft", "strong"):
        raise make_error(f"Invalid pixel outline: {value}. Supported values: none, soft, strong.")
    return outline


def _decode_png(data: bytes) -> tuple[int, int, int, int, int, bytearray]:
    chunks = _read_chunks(data)
    ihdr = next((chunk_data for chunk_type, chunk_data in chunks if chunk_type == "IHDR"), None)
    if ihdr is None:
        raise make_error("PNG is missing IHDR.")

    width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", ihdr)
    channels = CHANNELS_BY_COLOR_TYPE.get(color_type)
    if bit_depth != 8 or compression != 0 or filter_method != 0 or interlace != 0 or channels is None:
        raise make_error("Only non-interlaced 8-bit grayscale/RGB/RGBA PNG images can be resized.")

    idat = b"".join(chunk_data for chunk_type, chunk_data in chunks if chunk_type == "IDAT")
    inflated = zlib.decompress(idat)
    pixels = _unfilter_scanlines(inflated, width, height, channels)
    return width, height, bit_depth, color_type, channels, pixels


def _split_color_box(colors: list[tuple[int, int, int]]):
    mins = [min(color[index] for color in colors) for index in range(3)]
    maxes = [max(color[index] for color in colors) for index in range(3)]
    ranges = [maxes[index] - mins[index] for index in range(3)]
    axis = ranges.index(max(ranges))
    sorted_colors = sorted(colors, key=lambda color: color[axis])
    midpoint = max(1, len(sorted_colors) // 2)
    return sorted_colors[:midpoint], sorted_colors[midpoint:]


def _average_color(colors: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    return tuple(round(sum(color[index] for color in colors) / len(colors)) for index in range(3))


def _build_palette(pixels: bytearray, channels: int, palette_size: int) -> list[tuple[int, int, int]]:
    colors: list[tuple[int, int, int]] = []
    for offset in range(0, len(pixels), channels):
        if (channels == 2 and pixels[offset + 1] < 128) or (channels == 4 and pixels[offset + 3] < 128):
            continue
        if channels in (1, 2):
            colors.append((pixels[offset], pixels[offset], pixels[offset]))
        else:
            colors.append((pixels[offset], pixels[offset + 1], pixels[offset + 2]))

    if not colors:
        return [(0, 0, 0)]

    boxes = [colors]
    while len(boxes) < palette_size:
        boxes.sort(key=len, reverse=True)
        box = boxes.pop(0)
        if len(box) <= 1:
            boxes.append(box)
            break
        left, right = _split_color_box(box)
        boxes.extend([left, right])
    seen = set()
    palette = []
    for color in [_average_color(box) for box in boxes if box]:
        if color not in seen:
            seen.add(color)
            palette.append(color)
    return palette


def _nearest_palette_color(color: tuple[float, float, float], palette: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    return min(
        palette,
        key=lambda candidate: (
            (color[0] - candidate[0]) ** 2 + (color[1] - candidate[1]) ** 2 + (color[2] - candidate[2]) ** 2
        ),
    )


def _luminance(color: tuple[int | float, int | float, int | float]) -> float:
    return (0.299 * color[0]) + (0.587 * color[1]) + (0.114 * color[2])


def _color_distance_squared(
    left: tuple[int | float, int | float, int | float],
    right: tuple[int | float, int | float, int | float],
) -> float:
    return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2


def _darken_color(color: tuple[int, int, int], factor: float) -> tuple[int, int, int]:
    return tuple(max(0, round(value * factor)) for value in color)


def _nearest_darker_palette_color(
    color: tuple[int, int, int],
    palette: list[tuple[int, int, int]],
    target: tuple[int, int, int],
) -> tuple[int, int, int]:
    original_lum = _luminance(color)
    candidates = [candidate for candidate in palette if _luminance(candidate) <= original_lum - 4]
    if not candidates:
        return _nearest_palette_color(target, palette)
    return min(candidates, key=lambda candidate: _color_distance_squared(candidate, target))


def _should_protect_from_dither(color: tuple[int, int, int]) -> bool:
    red, green, blue = color
    saturation = max(color) - min(color)
    warm_skin_like = red >= 130 and green >= 80 and blue >= 45 and red >= green >= blue and red - blue <= 120
    light_focal_flat = red >= 170 and green >= 140 and blue >= 100 and saturation <= 90
    return warm_skin_like or light_focal_flat


def _boost_outline_contrast(
    pixels: bytearray,
    width: int,
    height: int,
    channels: int,
    palette: list[tuple[int, int, int]],
    outline: str,
) -> tuple[bytearray, int]:
    if outline == "none":
        return pixels, 0

    output = bytearray(pixels)
    threshold = 32 if outline == "strong" else 48
    dark_gap = 8 if outline == "strong" else 18
    factor = 0.55 if outline == "strong" else 0.72
    boosted_pixels = 0

    for y in range(height):
        for x in range(width):
            offset = (y * width + x) * channels
            if (channels == 2 and pixels[offset + 1] < 128) or (channels == 4 and pixels[offset + 3] < 128):
                continue
            if channels in (1, 2):
                color = (pixels[offset], pixels[offset], pixels[offset])
            else:
                color = (pixels[offset], pixels[offset + 1], pixels[offset + 2])

            color_lum = _luminance(color)
            max_distance = 0.0
            brightest_neighbor_lum = color_lum
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                neighbor_offset = (ny * width + nx) * channels
                if (channels == 2 and pixels[neighbor_offset + 1] < 128) or (
                    channels == 4 and pixels[neighbor_offset + 3] < 128
                ):
                    continue
                if channels in (1, 2):
                    neighbor = (pixels[neighbor_offset], pixels[neighbor_offset], pixels[neighbor_offset])
                else:
                    neighbor = (
                        pixels[neighbor_offset],
                        pixels[neighbor_offset + 1],
                        pixels[neighbor_offset + 2],
                    )
                max_distance = max(max_distance, _color_distance_squared(color, neighbor))
                brightest_neighbor_lum = max(brightest_neighbor_lum, _luminance(neighbor))

            if max_distance < threshold * threshold or color_lum > brightest_neighbor_lum - dark_gap:
                continue

            boosted = _nearest_darker_palette_color(color, palette, _darken_color(color, factor))
            if channels in (1, 2):
                output[offset] = round(sum(boosted) / 3)
            else:
                output[offset] = boosted[0]
                output[offset + 1] = boosted[1]
                output[offset + 2] = boosted[2]
            boosted_pixels += 1

    return output, boosted_pixels


def _quantize_pixels(
    pixels: bytearray,
    width: int,
    height: int,
    channels: int,
    palette_size: int,
    dither: str,
) -> tuple[bytearray, list[tuple[int, int, int]]]:
    palette = _build_palette(pixels, channels, palette_size)
    output = bytearray(pixels)
    matrix = BAYER_MATRICES[dither]
    matrix_size = len(matrix) if matrix else 0
    dither_strength = 18 if matrix else 0

    for y in range(height):
        for x in range(width):
            offset = (y * width + x) * channels
            if (channels == 2 and output[offset + 1] < 128) or (channels == 4 and output[offset + 3] < 128):
                continue

            if channels in (1, 2):
                base = (output[offset], output[offset], output[offset])
            else:
                base = (output[offset], output[offset + 1], output[offset + 2])

            threshold = 0.0
            if matrix and not _should_protect_from_dither(base):
                threshold = ((matrix[y % matrix_size][x % matrix_size] / (matrix_size * matrix_size - 1)) - 0.5) * dither_strength

            source = (base[0] + threshold, base[1] + threshold, base[2] + threshold)
            nearest = _nearest_palette_color(source, palette)
            if channels in (1, 2):
                output[offset] = round(sum(nearest) / 3)
            else:
                output[offset] = nearest[0]
                output[offset + 1] = nearest[1]
                output[offset + 2] = nearest[2]
            if channels == 2:
                output[offset + 1] = 0 if output[offset + 1] < 128 else 255
            if channels == 4:
                output[offset + 3] = 0 if output[offset + 3] < 128 else 255
    return output, palette


def _write_chunk(chunk_type: str, data: bytes = b"") -> bytes:
    type_bytes = chunk_type.encode("ascii")
    crc = zlib.crc32(type_bytes + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + type_bytes + data + struct.pack(">I", crc)


def _encode_png(
    *,
    width: int,
    height: int,
    bit_depth: int,
    color_type: int,
    pixels: bytearray,
    channels: int,
) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, bit_depth, color_type, 0, 0, 0)
    stride = width * channels
    scanlines = bytearray(height * (stride + 1))
    for y in range(height):
        target_offset = y * (stride + 1)
        scanlines[target_offset] = 0
        scanlines[target_offset + 1 : target_offset + 1 + stride] = pixels[y * stride : (y + 1) * stride]

    return PNG_SIGNATURE + _write_chunk("IHDR", ihdr) + _write_chunk("IDAT", zlib.compress(bytes(scanlines))) + _write_chunk("IEND")


def resize_png_bytes(data: bytes, pixel_size: str | int | None) -> bytes:
    target = _parse_pixel_size(pixel_size)
    if target is None:
        return data

    width, height, bit_depth, color_type, channels, pixels = _decode_png(data)
    target_width, target_height = target
    if width == target_width and height == target_height:
        return data

    resized = _resize_nearest(pixels, width, height, target_width, target_height, channels)
    return _encode_png(
        width=target_width,
        height=target_height,
        bit_depth=bit_depth,
        color_type=color_type,
        pixels=resized,
        channels=channels,
    )


def process_pixel_art_png_bytes(
    data: bytes,
    *,
    pixel_size: str | int,
    palette_size: str | int | None = None,
    dither: str | None = None,
    outline: str | None = None,
) -> tuple[bytes, dict[str, int | str]]:
    target = _parse_pixel_size(pixel_size)
    if target is None:
        raise make_error("pixel_size is required when pixel mode is enabled.")

    target_width, target_height = target
    parsed_palette_size = _parse_palette_size(palette_size)
    parsed_dither = _parse_dither(dither)
    parsed_outline = _parse_outline(outline)
    width, height, bit_depth, color_type, channels, pixels = _decode_png(data)
    resized = _resize_area(pixels, width, height, target_width, target_height, channels)
    quantized, palette = _quantize_pixels(
        resized, target_width, target_height, channels, parsed_palette_size, parsed_dither
    )
    outlined, outline_boosted_pixels = _boost_outline_contrast(
        quantized, target_width, target_height, channels, palette, parsed_outline
    )
    return (
        _encode_png(
            width=target_width,
            height=target_height,
            bit_depth=bit_depth,
            color_type=color_type,
            pixels=outlined,
            channels=channels,
        ),
        {
            "width": target_width,
            "height": target_height,
            "paletteSize": parsed_palette_size,
            "actualPaletteSize": len(palette),
            "dither": parsed_dither,
            "outline": parsed_outline,
            "outlineBoostedPixels": outline_boosted_pixels,
        },
    )


def upscale_png_bytes(data: bytes, scale: str | int) -> bytes:
    factor = _parse_positive_int(scale, "preview upscale", 1)
    if factor == 1:
        return data
    width, height, bit_depth, color_type, channels, pixels = _decode_png(data)
    resized = _resize_nearest(pixels, width, height, width * factor, height * factor, channels)
    return _encode_png(
        width=width * factor,
        height=height * factor,
        bit_depth=bit_depth,
        color_type=color_type,
        pixels=resized,
        channels=channels,
    )
