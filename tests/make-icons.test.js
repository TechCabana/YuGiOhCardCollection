import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import {
    token,
    rgb,
    crc32,
    encodePng,
    encodeIco,
    canvas,
    buildIcon,
    buildSocialPreview,
    buildSvgIcon,
    FRAME_TOKENS
} from '../scripts/make-icons.mjs';

/**
 * Guards the icon generator.
 *
 * There is no image library here, so the PNGs are checked by decoding them:
 * signature, chunk CRCs, IHDR geometry, and the actual pixels the inflated
 * IDAT contains. That is the only way to tell a real PNG from a file that
 * merely starts with the right eight bytes.
 *
 * crc32 is proven against the standard check vector first, so every later
 * assertion that leans on it is not circular.
 */

const read = (relativePath) =>
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Walk a PNG's chunks, verifying each CRC as it goes. */
function parseChunks(png) {
    const chunks = [];
    let offset = 8;

    while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('ascii', offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length);
        const stored = png.readUInt32BE(offset + 8 + length);

        expect(crc32(png.subarray(offset + 4, offset + 8 + length))).toBe(stored);

        chunks.push({ type, data });
        offset += 12 + length;
    }

    return chunks;
}

/** Decode a PNG this module produced back into geometry and RGBA pixels. */
function decodePng(png) {
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);

    const chunks = parseChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);

    const ihdr = chunks[0].data;
    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    expect(ihdr[8]).toBe(8);   // bit depth
    expect(ihdr[9]).toBe(6);   // RGBA
    expect(ihdr[12]).toBe(0);  // not interlaced

    const raw = inflateSync(chunks[1].data);
    const stride = width * 4;
    expect(raw.length).toBe(height * (stride + 1));

    // Every scanline must declare filter 0, which is what the encoder writes.
    const pixels = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y += 1) {
        expect(raw[y * (stride + 1)]).toBe(0);
        raw.copy(pixels, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    }

    const pixel = (x, y) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];

    return { width, height, pixel };
}

describe('crc32', () => {
    it('matches the standard check vector', () => {
        expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926);
    });

    it('is zero for empty input', () => {
        expect(crc32(Buffer.alloc(0))).toBe(0);
    });
});

describe('token', () => {
    it('reads a colour out of tokens.css', () => {
        expect(token('--accent')).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('throws rather than returning a colour it invented', () => {
        expect(() => token('--not-a-real-token')).toThrow(/not found/);
    });

    it('resolves every frame the social preview draws', () => {
        for (const frame of FRAME_TOKENS) {
            expect(token(frame)).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
});

describe('rgb', () => {
    it('splits a hex colour into channels', () => {
        expect(rgb('#0b0b0d')).toEqual([11, 11, 13]);
        expect(rgb('#ffffff')).toEqual([255, 255, 255]);
    });
});

describe('encodePng', () => {
    it('round-trips a solid image', () => {
        const surface = canvas(4, 3, '#112233');
        const { width, height, pixel } = decodePng(encodePng(4, 3, surface.pixels));

        expect([width, height]).toEqual([4, 3]);
        expect(pixel(0, 0)).toEqual([0x11, 0x22, 0x33, 255]);
        expect(pixel(3, 2)).toEqual([0x11, 0x22, 0x33, 255]);
    });

    it('refuses a pixel buffer of the wrong length', () => {
        expect(() => encodePng(4, 4, new Uint8Array(10))).toThrow(/expected 64/);
    });
});

describe('canvas.roundedRect', () => {
    it('fills the interior and leaves the corner alone', () => {
        const surface = canvas(20, 20, '#000000');
        surface.roundedRect(0, 0, 20, 20, 8, '#ffffff');
        const { pixel } = decodePng(encodePng(20, 20, surface.pixels));

        expect(pixel(10, 10)).toEqual([255, 255, 255, 255]);  // centre, filled
        expect(pixel(0, 0)).toEqual([0, 0, 0, 255]);          // corner, rounded away
    });

    it('draws a square when the radius is zero', () => {
        const surface = canvas(10, 10, '#000000');
        surface.roundedRect(0, 0, 10, 10, 0, '#ffffff');
        const { pixel } = decodePng(encodePng(10, 10, surface.pixels));

        expect(pixel(0, 0)).toEqual([255, 255, 255, 255]);
    });
});

describe('buildIcon', () => {
    it.each([32, 180])('produces a %ipx square PNG', (size) => {
        const { width, height, pixel } = decodePng(buildIcon(size));

        expect([width, height]).toEqual([size, size]);
        // The ground is the page background; the mark is the accent.
        expect(pixel(0, 0)).toEqual([...rgb(token('--bg')), 255]);
        expect(pixel(Math.floor(size / 2), Math.floor(size * 0.13))).toEqual([
            ...rgb(token('--accent')),
            255
        ]);
    });
});

describe('buildSocialPreview', () => {
    it('is 1200x630, the size platforms crop toward', () => {
        const { width, height } = decodePng(buildSocialPreview());
        expect([width, height]).toEqual([1200, 630]);
    });

    it('bands all ten frame colours across the top', () => {
        const { pixel } = decodePng(buildSocialPreview());
        const bandWidth = 1200 / FRAME_TOKENS.length;

        FRAME_TOKENS.forEach((frame, index) => {
            const x = Math.floor(index * bandWidth + bandWidth / 2);
            expect(pixel(x, 4)).toEqual([...rgb(token(frame)), 255]);
        });
    });
});

describe('encodeIco', () => {
    it('wraps the PNG with a readable directory entry', () => {
        const png = buildIcon(32);
        const ico = encodeIco(png, 32);

        expect(ico.readUInt16LE(0)).toBe(0);  // reserved
        expect(ico.readUInt16LE(2)).toBe(1);  // type: icon
        expect(ico.readUInt16LE(4)).toBe(1);  // one image
        expect(ico[6]).toBe(32);              // width
        expect(ico[7]).toBe(32);              // height
        expect(ico.readUInt16LE(12)).toBe(32);  // bits per pixel
        expect(ico.readUInt32LE(14)).toBe(png.length);
        expect(ico.readUInt32LE(18)).toBe(22);  // offset past the header

        expect(ico.subarray(22)).toEqual(png);
    });

    it('rejects a size the format cannot express', () => {
        expect(() => encodeIco(Buffer.alloc(4), 512)).toThrow(/outside 1-256/);
    });
});

describe('the committed icons', () => {
    // A generated binary that no longer matches its generator is a file nobody
    // can safely regenerate, which is the whole reason the generator exists.
    it('match what the generator produces today', () => {
        expect(read('../assets/icons/favicon-32.png')).toEqual(buildIcon(32));
        expect(read('../assets/icons/apple-touch-icon.png')).toEqual(buildIcon(180));
        expect(read('../assets/icons/og-image.png')).toEqual(buildSocialPreview());
        expect(read('../assets/icons/favicon.ico')).toEqual(encodeIco(buildIcon(32), 32));
        expect(read('../assets/icons/favicon.svg').toString('utf8')).toBe(buildSvgIcon());
    });

    it('ship an SVG that carries no external reference', () => {
        const svg = read('../assets/icons/favicon.svg').toString('utf8');
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    });
});
