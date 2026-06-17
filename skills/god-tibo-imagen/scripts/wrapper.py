#!/usr/bin/env python3
"""Agent-skill wrapper for god-tibo-imagen.

A lightweight CLI wrapper around the god-tibo-imagen Python SDK designed
for invocation from any coding agent that supports the Agent Skills format
(Claude Code, Codex, Cursor, OpenCode, Continue, Gemini CLI, etc.) as well
as direct command-line usage.

Example:
    python wrapper.py --prompt "flat blue square" --output ./out.png --dry-run
    python wrapper.py --prompt "pixel sword" --output ./sword.png --pixel-mode --pixel-size 128
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PYTHON_SRC = REPO_ROOT / "python" / "src"
if PYTHON_SRC.exists():
    sys.path.insert(0, str(PYTHON_SRC))

from gti.client import Client


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate images via the god-tibo-imagen Python SDK."
    )
    parser.add_argument("--prompt", required=True, help="Image generation prompt")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument("--model", help="Model to use (defaults to SDK configuration)")
    parser.add_argument("--size", help="Backend image size, e.g. 1024x1024")
    parser.add_argument("--pixel-size", help="Final pixel output size, e.g. 128 or 64x64")
    parser.add_argument("--pixel-mode", action="store_true", help="Apply pixel-art prompt constraints and palette cleanup")
    parser.add_argument("--pixel-palette", help="Pixel-mode palette size, 2-256 colors")
    parser.add_argument("--pixel-dither", help="Pixel-mode dithering: none, bayer2, or bayer4")
    parser.add_argument("--pixel-outline", help="Pixel-mode outline contrast: none, soft, or strong")
    parser.add_argument("--preview-upscale", help="Write a nearest-neighbor .preview.png scaled by this factor")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode")
    parser.add_argument("--auth-file", help="Path to Codex auth.json")
    parser.add_argument(
        "--installation-id-file", help="Path to Codex installation_id file"
    )
    parser.add_argument(
        "--image",
        action="append",
        help="Input image path (can be used multiple times)",
    )
    parser.add_argument(
        "--debug", action="store_true", help="Enable debug output"
    )
    args = parser.parse_args()

    client_kwargs: dict[str, str] = {}
    if args.auth_file:
        client_kwargs["authFile"] = args.auth_file
    if args.installation_id_file:
        client_kwargs["installationIdFile"] = args.installation_id_file

    client = Client(**client_kwargs)

    gen_kwargs: dict[str, object] = {
        "prompt": args.prompt,
        "dry_run": args.dry_run,
    }
    if args.model:
        gen_kwargs["model"] = args.model
    if args.size:
        gen_kwargs["size"] = args.size
    if args.pixel_size:
        gen_kwargs["pixel_size"] = args.pixel_size
    if args.pixel_mode:
        gen_kwargs["pixel_mode"] = True
    if args.pixel_palette:
        gen_kwargs["pixel_palette"] = args.pixel_palette
    if args.pixel_dither:
        gen_kwargs["pixel_dither"] = args.pixel_dither
    if args.pixel_outline:
        gen_kwargs["pixel_outline"] = args.pixel_outline
    if args.preview_upscale:
        gen_kwargs["preview_upscale"] = args.preview_upscale
    if args.output:
        gen_kwargs["output_path"] = args.output
    if args.image:
        gen_kwargs["image_paths"] = args.image
    if args.debug:
        gen_kwargs["debug"] = True

    result = client.generate_image(**gen_kwargs)

    output = {
        "mode": result.mode,
        "savedPath": result.saved_path,
        "previewPath": result.preview_path,
        "pixelMetadata": result.pixel_metadata,
        "responseId": result.response_id,
        "sessionId": result.session_id,
        "revisedPrompt": result.revised_prompt,
        "warnings": result.warnings,
    }
    if result.request is not None:
        output["request"] = result.request
    if result.response is not None:
        output["response"] = result.response

    print(json.dumps(output, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
