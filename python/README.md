# god-tibo-imagen

Python SDK for Codex-authenticated image generation with pixel-art post-processing.

> WARNING: This is **not** a supported public API integration. It depends on private Codex request behavior that may change without notice.

## Installation

```bash
pip install god-tibo-imagen
```

## Usage

```python
from gti import Client

client = Client(provider="private-codex")
result = client.generate_image(
    prompt="flat blue square icon",
    model="gpt-5.4",
    output_path="./out.png"
)
print(result.saved_path)
```

### Image input

You can provide existing images as additional context alongside your text prompt. Images are embedded as base64 data URLs and sent with the request.

```python
# single image
result = client.generate_image(
    prompt="Make this cat wear a hat",
    model="gpt-5.4",
    output_path="./cat-hat.png",
    image_paths="./cat.png"
)

# multiple images
result = client.generate_image(
    prompt="Combine these two styles",
    model="gpt-5.4",
    output_path="./combined.png",
    image_paths=["./style-a.png", "./style-b.png"]
)
```

Supported formats: `png`, `jpg`/`jpeg`, `gif`, `webp`.

### Output size and pixel output

Use `size` for backend-supported generation dimensions, and `pixel_size` to resize the saved PNG after generation for pixel-art workflows.

```python
result = client.generate_image(
    prompt="32x32 pixel art sword sprite, transparent background",
    model="gpt-5.4",
    output_path="./sword-32.png",
    size="1024x1024",
    pixel_size=32
)
print(result.saved_path)
```

`pixel_size` accepts `32`, `"64"`, or `"128x128"` style values.

### Pixel mode

Use `pixel_mode=True` to add pixel-art prompt constraints and post-process the result with area downscaling, palette limiting, optional ordered dithering, and nearest-neighbor preview output.

```python
result = client.generate_image(
    prompt="cute Korean Joseon-era scholar programmer coding on a laptop",
    model="gpt-5.4",
    output_path="./scholar-programmer.png",
    size="1024x1024",
    pixel_mode=True,
    pixel_size=128,
    pixel_palette=24,
    preview_upscale=4,
)
print(result.saved_path)
print(result.preview_path)
print(result.pixel_metadata)
```

### Dry run

```python
result = client.generate_image(
    prompt="flat blue square icon",
    dry_run=True
)
print(result["mode"])  # "dry-run"
```
