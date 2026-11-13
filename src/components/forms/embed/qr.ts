// A small, dependency-free QR code encoder (ISO/IEC 18004).
//
// Why write our own? No QR library is installed and a share-link QR only
// needs a tiny subset of the standard:
//   - byte mode (any text, UTF-8),
//   - error correction level M (~15% of the code can be damaged and it still
//     scans, which is the usual choice for printed codes),
//   - versions 1–10 (up to 213 bytes, plenty for a URL).
//
// The steps follow the standard:
//   1. Turn the text into bits: mode, length, data, terminator, padding.
//   2. Split into blocks and add Reed–Solomon error-correction codewords.
//   3. Draw the fixed patterns (finders, timing, alignment, format/version).
//   4. Fill the data bits in a zig-zag from the bottom-right corner.
//   5. Try all 8 masks and keep the one the standard's penalty rules like best.
//
// Pure functions only (no DOM), so it runs on the server, the client and in
// Node test scripts.

/** A finished QR code: `modules[y][x]` is true for a dark square. */
export type QrCode = {
  version: number;
  /** Width and height in modules (21 for version 1, +4 per version). */
  size: number;
  /** Which of the 8 mask patterns was chosen (0–7). */
  mask: number;
  modules: boolean[][];
};

export const QR_MAX_VERSION = 10;

// ── Tables for error-correction level M (from the standard) ─────────────────

/**
 * For each version (index 1–10): EC codewords per block, and the block layout
 * as [number of blocks, data codewords per block] groups.
 */
const EC_M: Record<number, { ecPerBlock: number; groups: [number, number][] }> = {
  1: { ecPerBlock: 10, groups: [[1, 16]] },
  2: { ecPerBlock: 16, groups: [[1, 28]] },
  3: { ecPerBlock: 26, groups: [[1, 44]] },
  4: { ecPerBlock: 18, groups: [[2, 32]] },
  5: { ecPerBlock: 24, groups: [[2, 43]] },
  6: { ecPerBlock: 16, groups: [[4, 27]] },
  7: { ecPerBlock: 18, groups: [[4, 31]] },
  8: { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  9: { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
};

/** Centre rows/columns of the small alignment squares, per version. */
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** Total data codewords (bytes) a version holds at level M. */
export function dataCapacity(version: number): number {
  return EC_M[version].groups.reduce((sum, [count, size]) => sum + count * size, 0);
}

/** Bits used for the byte count: 8 for versions 1–9, 16 from version 10. */
function countBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

// ── Reed–Solomon over GF(256) ───────────────────────────────────────────────
// QR codes use the field GF(2^8) built from the polynomial x^8+x^4+x^3+x^2+1
// (0x11D). We precompute log/antilog tables so multiplying is a table lookup.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // Doubling the table saves a "% 255" in gfMul.
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial (x - α^0)(x - α^1)…(x - α^(degree-1)), highest power first. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The `degree` error-correction codewords for one block of data (polynomial division remainder). */
export function reedSolomonEc(data: number[], degree: number): number[] {
  const gen = generatorPoly(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ── Format & version information (BCH codes) ────────────────────────────────

/** The 15 format bits for level M and a mask (level M = binary 00). */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  // The XOR stops the format area from ever being all light.
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18 version bits (only drawn for version 7 and up). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

// ── Building the code ───────────────────────────────────────────────────────

/** Turn bytes into the final codeword sequence (data + EC, interleaved). */
function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const capacityBits = dataCapacity(version) * 8;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // mode indicator: byte mode
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  // Terminator: up to four 0 bits, then 0s up to a whole byte.
  push(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  // Fill the rest with the standard's alternating pad bytes.
  for (let pad = 0xec; data.length < capacityBits / 8; pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks and compute each block's error correction.
  const { ecPerBlock, groups } = EC_M[version];
  const dataBlocks: number[][] = [];
  let offset = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i++) {
      dataBlocks.push(data.slice(offset, offset + size));
      offset += size;
    }
  }
  const ecBlocks = dataBlocks.map((block) => reedSolomonEc(block, ecPerBlock));

  // Interleave: first byte of every block, then the second, … (short blocks
  // simply run out earlier), then the same for the EC bytes. This spreads
  // damage (a scratch, a coffee stain) across blocks.
  const out: number[] = [];
  const longest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const block of ecBlocks) out.push(block[i]);
  return out;
}

/** Mask condition for module (x = column, y = row): true means "flip it". */
function maskHit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** A grid plus a parallel "is this a fixed pattern (not data)?" grid. */
type Grid = { size: number; dark: boolean[][]; fixed: boolean[][] };

function newGrid(size: number): Grid {
  const make = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, dark: make(), fixed: make() };
}

function setFixed(g: Grid, x: number, y: number, dark: boolean) {
  g.dark[y][x] = dark;
  g.fixed[y][x] = true;
}

/** Draws everything that isn't data. Format bits get placeholders (filled per mask later). */
function drawFunctionPatterns(g: Grid, version: number) {
  const { size } = g;

  // Timing patterns: alternating dark/light along row 6 and column 6.
  for (let i = 0; i < size; i++) {
    setFixed(g, 6, i, i % 2 === 0);
    setFixed(g, i, 6, i % 2 === 0);
  }

  // Three finder patterns (the big squares) with their light separators.
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy)); // 0..4 rings
        setFixed(g, x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  // Alignment patterns (small squares), except where they'd hit a finder.
  const pos = ALIGNMENT[version];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFixed(g, pos[j] + dx, pos[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve the format areas (drawn for real in drawFormat) and the version blocks.
  drawFormat(g, 0);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFixed(g, a, b, dark); // top-right block
      setFixed(g, b, a, dark); // bottom-left block
    }
  }
}

/** Writes the 15 format bits (twice, for redundancy) plus the always-dark module. */
function drawFormat(g: Grid, mask: number) {
  const { size } = g;
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;

  // Copy 1, around the top-left finder.
  for (let i = 0; i <= 5; i++) setFixed(g, 8, i, bit(i));
  setFixed(g, 8, 7, bit(6));
  setFixed(g, 8, 8, bit(7));
  setFixed(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFixed(g, 14 - i, 8, bit(i));

  // Copy 2, split between the top-right and bottom-left finders.
  for (let i = 0; i < 8; i++) setFixed(g, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFixed(g, 8, size - 15 + i, bit(i));
  setFixed(g, 8, size - 8, true); // the "dark module", always dark
}

/** Places codeword bits in the two-column zig-zag, skipping fixed patterns. */
function drawData(g: Grid, codewords: number[]) {
  const { size } = g;
  const totalBits = codewords.length * 8;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // column 6 is the vertical timing pattern
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (g.fixed[y][x]) continue;
        // Leftover "remainder bits" after the last codeword stay light.
        g.dark[y][x] = i < totalBits && ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}

function applyMask(g: Grid, mask: number) {
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (!g.fixed[y][x] && maskHit(mask, x, y)) g.dark[y][x] = !g.dark[y][x];
    }
  }
}

/** The standard's four penalty rules; lower = easier for scanners. */
function penalty(dark: boolean[][]): number {
  const size = dark.length;
  let score = 0;
  const at = (x: number, y: number, vertical: boolean) => (vertical ? dark[x][y] : dark[y][x]);

  for (const vertical of [false, true]) {
    for (let y = 0; y < size; y++) {
      // Rule 1: five or more same-coloured modules in a row.
      let run = 1;
      for (let x = 1; x < size; x++) {
        if (at(x, y, vertical) === at(x - 1, y, vertical)) {
          run++;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);

      // Rule 3: the finder-like pattern 1011101 with 4 light modules on one side.
      for (let x = 0; x + 10 < size; x++) {
        const s = Array.from({ length: 11 }, (_, k) => (at(x + k, y, vertical) ? "1" : "0")).join("");
        if (s === "10111010000" || s === "00001011101") score += 40;
      }
    }
  }

  // Rule 2: 2×2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = dark[y][x];
      if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) score += 3;
    }
  }

  // Rule 4: overall balance of dark vs light.
  const darkCount = dark.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const percent = (darkCount * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/**
 * Encode text (e.g. a URL) as a QR code at error-correction level M.
 * Throws if the text is too long for version 10 (213 bytes).
 */
export function encodeQr(text: string): QrCode {
  const bytes = new TextEncoder().encode(text);

  // The smallest version that fits: 4 mode bits + length bits + 8 bits per byte.
  let version = 0;
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    if (4 + countBits(v) + bytes.length * 8 <= dataCapacity(v) * 8) {
      version = v;
      break;
    }
  }
  if (version === 0) throw new Error("This link is too long for a QR code.");

  const size = version * 4 + 17;
  const codewords = buildCodewords(bytes, version);

  // Try each mask on a fresh copy and keep the lowest penalty.
  let best: { mask: number; dark: boolean[][]; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = newGrid(size);
    drawFunctionPatterns(g, version);
    drawData(g, codewords);
    applyMask(g, mask);
    drawFormat(g, mask);
    const score = penalty(g.dark);
    if (!best || score < best.score) best = { mask, dark: g.dark, score };
  }
  return { version, size, mask: best!.mask, modules: best!.dark };
}

/**
 * One SVG path for all dark modules (small and crisp at any size).
 * Coordinates include a 4-module light "quiet zone", which scanners need.
 */
export function qrSvgPath(qr: QrCode, border = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push(`M${x + border} ${y + border}h1v1h-1z`);
    }
  }
  return parts.join("");
}

/** A complete, standalone SVG file (for "Download SVG"). */
export function qrSvgDocument(qr: QrCode, opts: { border?: number; pixelsPerModule?: number } = {}): string {
  const border = opts.border ?? 4;
  const dim = qr.size + border * 2;
  const px = dim * (opts.pixelsPerModule ?? 10);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path d="${qrSvgPath(qr, border)}" fill="#000000"/>` +
    `</svg>\n`
  );
}
