---
name: god-tibo-imagen
description: >-
  Use this skill whenever the user asks to generate, create, render, draw, or
  make an image, picture, illustration, icon, logo, or any other visual asset.
  It is especially suited for pixel art, game icons, sprites, and retro
  low-resolution assets.
  Also use it when the user wants to edit, modify, restyle, or combine
  existing images (provide them as inputs). The skill drives the `gti` CLI,
  which uses the user's local Codex ChatGPT authentication to call the
  private image-generation backend. Trigger phrases include "generate an
  image", "create a picture", "make an image of", "draw me a", "render
  this", "make this cat wear a hat", and similar. Prefer this skill over
  describing images in text.
---

# god-tibo-imagen

Generate images from text prompts (and optional reference images) by running
the `gti` CLI. For pixel art, prefer `--pixel-mode` with `--pixel-size`,
`--pixel-palette`, and `--preview-upscale`.

## How to invoke

Use the `gti` command. It is installed globally via
`npm install -g god-tibo-imagen` and ships with this repo.

### Basic generation

```bash
gti --prompt "flat blue square icon" --output ./out.png
```

### With reference images

Pass `--image <path>` one or more times to use existing images as input.

```bash
gti --prompt "Make this cat wear a hat" --image ./cat.png --output ./cat-hat.png
```

```bash
gti --prompt "Combine these two styles" --image ./a.png --image ./b.png --output ./combined.png
```

Supported input formats: `png`, `jpg`/`jpeg`, `gif`, `webp`.

### Output size

Pass `--size <value>` to control output dimensions.

```bash
gti --prompt "a sunset over mountains" --size 1536x1024 --output ./sunset.png
```

Allowed values:

- `auto` (model decides)
- `1024x1024`, `2048x2048` (square)
- `1536x1024`, `2048x1152`, `3840x2160` (landscape)
- `1024x1536`, `2160x3840` (portrait)

### Pixel output size

Use `--pixel-size <value>` to resize the saved PNG after generation for pixel-art workflows. This does not request unsupported tiny backend canvas sizes; it writes a nearest-neighbor resized final PNG.

```bash
gti --prompt "32x32 pixel art sword sprite, transparent background" --size 1024x1024 --pixel-size 32 --output ./sword-32.png
```

### Pixel mode

Use `--pixel-mode` for serious pixel-art output. It adds prompt constraints for crisp square pixels, limited palettes, no anti-aliasing, clean outlines, no double pixels, and smoother stair-step lines, then applies palette cleanup after generation.

```bash
gti --prompt "cute Korean Joseon-era scholar programmer coding on a laptop" \
  --size 1024x1024 \
  --pixel-mode \
  --pixel-size 128 \
  --pixel-palette 24 \
  --preview-upscale 4 \
  --output ./scholar-programmer.png
```

Report both `savedPath` and `previewPath` when present. The preview is larger and easier for users to inspect.

### Dry run

Validate auth and print the request without making a network call.

```bash
gti --prompt "flat blue square icon" --dry-run
```

## Required arguments

- `--prompt <text>` — required text prompt
- `--output <path>` — output PNG path (required for live runs)

## Prerequisites the agent must check

- `gti` is on `PATH` (`npm install -g god-tibo-imagen` if missing).
- The user has Codex ChatGPT auth at `~/.codex/auth.json` with
  `auth_mode = chatgpt`. If it is missing, stop and tell the user — do
  **not** try to install Codex or fabricate auth state.

## After running

`gti` saves the PNG to `--output` and prints a JSON summary that includes
`savedPath`. Pixel-mode runs may also include `previewPath` and
`pixelMetadata`. Report those back to the user when present.
