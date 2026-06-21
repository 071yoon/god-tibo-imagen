#!/usr/bin/env node
// @ts-nocheck
import { animatePixelPngToGif } from '../fs/gifAnimate.js';

function parseArgs(argv) {
  const parsed = {
    input: null,
    output: null,
    frames: null,
    delay: null,
    effect: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case '--input':
        parsed.input = next;
        index += 1;
        break;
      case '--output':
        parsed.output = next;
        index += 1;
        break;
      case '--frames':
        parsed.frames = next;
        index += 1;
        break;
      case '--delay':
        parsed.delay = next;
        index += 1;
        break;
      case '--effect':
        parsed.effect = next;
        index += 1;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        if (!token.startsWith('-') && !parsed.input) {
          parsed.input = token;
        } else if (!token.startsWith('-') && !parsed.output) {
          parsed.output = token;
        } else {
          throw new Error(`Unknown argument: ${token}`);
        }
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  gti-animate --input ./sprite.png --output ./sprite.gif

Options:
  --input <path>       Required source pixel PNG
  --output <path>      Required output GIF path
  --frames <count>     Animation frame count, 2-32 (default: 8)
  --delay <centisec>   GIF frame delay in 1/100 seconds (default: 10)
  --effect <name>      Effect: shimmer | pulse | hue | typing | salt (default: shimmer)
  -h, --help           Show help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input || !args.output) {
    printHelp();
    if (!args.help) process.exitCode = 1;
    return;
  }

  const result = await animatePixelPngToGif({
    inputPath: args.input,
    outputPath: args.output,
    frames: args.frames,
    delay: args.delay,
    effect: args.effect
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
