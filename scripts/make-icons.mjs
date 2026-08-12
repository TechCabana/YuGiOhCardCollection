#!/usr/bin/env node
/**
 * Generate the favicon set and the social-preview image.
 *
 * The icons are committed, but they are generated rather than drawn: a binary
 * checked in with no way to regenerate it is a file nobody can safely change.
 * Run this after editing the palette and commit what it writes.
 *
 * Everything is built from the design tokens, read out of tokens.css at run
 * time, so an icon cannot drift from the site's own colours.
 *
 * The PNG encoder here is deliberately minimal — 8-bit RGBA, one IDAT, no
 * interlacing. That is enough for flat geometry and avoids a dependency for
 * six files. The ICO is a container around the 32px PNG, which is all the
 * format has needed since Vista.
 *
 * Every path resolves from the repo root rather than the working directory, so
 * the script produces the same files whichever directory it is run from.
 *
 * Usage:
 *   node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

/** Repo root, derived from this file's own location — never from cwd. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_CSS = resolve(REPO_ROOT, 'assets/css/tokens.css');
const OUTPUT_DIR = resolve(REPO_ROOT, 'assets/icons');

/**
 * Read a colour token out of tokens.css so the icons follow the palette.
 *
 * The stylesheet is read once and cached: a token lookup happens per shape,
 * and re-reading the file each time turned a cheap call into disk traffic.
 *
 * @param {string} name - the custom property, e.g. '--accent'
 * @returns {string} the six-digit hex value
 * @throws {Error} when the token is absent or is not a six-digit hex
 */
let tokens_css_cache = null;
export function token(name) {
    if (tokens_css_cache === null) tokens_css_cache = readFileSync(TOKENS_CSS, 'utf8');

    const value = tokens_css_cache.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
    if (!value) throw new Error(`Token ${name} not found, or not a six-digit hex`);
    return value;
}

/** #rrggbb to [r, g, b]. */
export const rgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

/** CRC32, as PNG defines it. */
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
});

export function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, data, CRC. */
function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);

    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));

    return Buffer.concat([length, typed, crc]);
}

/**
 * Encode an RGBA pixel buffer as a PNG.
 *
 * @param {number} width - image width
 * @param {number} height - image height
 * @param {Uint8Array} pixels - width * height * 4 bytes, RGBA
 * @returns {Buffer} the PNG file
 */
export function encodePng(width, height, pixels) {
    const expected = width * height * 4;
    if (pixels.length !== expected) {
        throw new Error(`Pixel buffer is ${pixels.length} bytes, expected ${expected}`);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;  // bit depth
    header[9] = 6;  // colour type: RGBA
    // 10, 11, 12 stay zero: deflate, adaptive filtering, no interlace.

    // Each scanline is prefixed with its filter type. 0 means "none", which
    // costs a little size and saves a lot of code.
    const stride = width * 4;
    const raw = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y += 1) {
        const start = y * (stride + 1);
        raw[start] = 0;
        Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, start + 1);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

/**
 * Wrap a PNG in an ICO container.
 *
 * Every browser that still asks for favicon.ico accepts a PNG payload, so this
 * is a six-byte directory header and a sixteen-byte entry around bytes that
 * already exist. Encoding a second time as BMP would buy nothing.
 *
 * @param {Buffer} png - the encoded PNG
 * @param {number} size - its edge length in pixels, 1 to 256
 * @returns {Buffer} the ICO file
 */
export function encodeIco(png, size) {
    if (size < 1 || size > 256) throw new Error(`ICO size ${size} is outside 1-256`);

    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);  // reserved
    header.writeUInt16LE(1, 2);  // type: icon
    header.writeUInt16LE(1, 4);  // one image

    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;  // 0 means 256 in this field
    entry[1] = size === 256 ? 0 : size;
    entry[2] = 0;   // palette size: none, it is truecolour
    entry[3] = 0;   // reserved
    entry.writeUInt16LE(1, 4);   // colour planes
    entry.writeUInt16LE(32, 6);  // bits per pixel
    entry.writeUInt32LE(png.length, 8);  // size of the image data
    entry.writeUInt32LE(header.length + entry.length, 12);  // offset to the data

    return Buffer.concat([header, entry, png]);
}

/** A drawing surface: a pixel buffer with the few primitives these icons need. */
export function canvas(width, height, background) {
    const pixels = new Uint8Array(width * height * 4);
    const [br, bg, bb] = rgb(background);

    for (let index = 0; index < width * height; index += 1) {
        pixels[index * 4] = br;
        pixels[index * 4 + 1] = bg;
        pixels[index * 4 + 2] = bb;
        pixels[index * 4 + 3] = 255;
    }

    /**
     * Fill a rounded rectangle.
     *
     * Corners are tested by distance from the corner centre, which gives a
     * clean quarter-circle without needing a path rasteriser.
     */
    const roundedRect = (x, y, w, h, radius, hex) => {
        const [r, g, b] = rgb(hex);

        for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, y + h); py += 1) {
            for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, x + w); px += 1) {
                const dx = Math.min(px - x, x + w - 1 - px);
                const dy = Math.min(py - y, y + h - 1 - py);

                if (dx < radius && dy < radius) {
                    const distance = Math.hypot(radius - dx, radius - dy);
                    if (distance > radius) continue;
                }

                const index = (py * width + px) * 4;
                pixels[index] = r;
                pixels[index + 1] = g;
                pixels[index + 2] = b;
                pixels[index + 3] = 255;
            }
        }
    };

    return { pixels, roundedRect, width, height };
}

/**
 * The mark: a card in the true 59:86 ratio, gold on the page ground.
 *
 * No lettering. Type cannot be rasterised here without a font engine, and a
 * crude approximation of the site's typeface would be worse than none.
 */
export function drawMark(surface, size) {
    const cardHeight = size * 0.74;
    const cardWidth = cardHeight * (59 / 86);
    const x = (size - cardWidth) / 2;
    const y = (size - cardHeight) / 2;
    const radius = Math.max(1, size * 0.06);

    surface.roundedRect(x, y, cardWidth, cardHeight, radius, token('--accent'));

    // An inset window, the way a real card frames its art. At favicon sizes
    // this reads as a highlight rather than a shape, which is the intent.
    const inset = size * 0.11;
    surface.roundedRect(
        x + inset,
        y + inset,
        cardWidth - inset * 2,
        cardHeight - inset * 2.4,
        Math.max(1, radius / 2),
        token('--bg')
    );
}

/** The ten card-frame colours, in the order the preview band lays them out. */
export const FRAME_TOKENS = [
    '--frame-normal', '--frame-effect', '--frame-ritual', '--frame-fusion',
    '--frame-synchro', '--frame-xyz', '--frame-link', '--frame-spell',
    '--frame-trap', '--frame-token'
];

/** A square icon at the given edge length, as PNG bytes. */
export function buildIcon(size) {
    const surface = canvas(size, size, token('--bg'));
    drawMark(surface, size);
    return encodePng(size, size, surface.pixels);
}

/**
 * The social preview, 1200x630 — the size every platform crops toward.
 *
 * A band of the ten card-frame colours across a dark ground, with the card
 * mark centred. It carries no words, for the same reason the favicon does not:
 * a link preview with badly-set type reads worse than one with none. A
 * typographic version needs a real design pass.
 */
export function buildSocialPreview() {
    const width = 1200;
    const height = 630;
    const og = canvas(width, height, token('--bg'));

    const bandWidth = width / FRAME_TOKENS.length;
    FRAME_TOKENS.forEach((frame, index) => {
        og.roundedRect(index * bandWidth, 0, bandWidth, 10, 0, token(frame));
    });

    const cardHeight = 420;
    const cardWidth = cardHeight * (59 / 86);
    const x = (width - cardWidth) / 2;
    const y = (height - cardHeight) / 2;

    og.roundedRect(x, y + 8, cardWidth, cardHeight, 20, token('--accent'));
    og.roundedRect(x + 34, y + 42, cardWidth - 68, cardHeight - 116, 10, token('--bg'));

    return encodePng(width, height, og.pixels);
}

/**
 * The SVG favicon, written from the same numbers as the PNGs so the two
 * cannot drift apart.
 */
export function buildSvgIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${token('--bg')}"/>
  <rect x="17.8" y="8.3" width="28.5" height="47.4" rx="4" fill="${token('--accent')}"/>
  <rect x="24.8" y="15.3" width="14.5" height="29.4" rx="2" fill="${token('--bg')}"/>
</svg>
`;
}

/** Write every icon to assets/icons, returning the paths written. */
export function writeIcons() {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const favicon32 = buildIcon(32);
    const files = [
        ['favicon-32.png', favicon32],
        ['favicon.ico', encodeIco(favicon32, 32)],
        ['apple-touch-icon.png', buildIcon(180)],
        ['og-image.png', buildSocialPreview()],
        ['favicon.svg', Buffer.from(buildSvgIcon(), 'utf8')]
    ];

    for (const [name, contents] of files) {
        writeFileSync(resolve(OUTPUT_DIR, name), contents);
    }

    return files.map(([name]) => `assets/icons/${name}`);
}

// Run only when invoked directly, so the tests can import the pieces above
// without writing files as a side effect of the import.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    for (const path of writeIcons()) console.log(path);
}
