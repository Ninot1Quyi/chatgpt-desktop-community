#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const HELP = `Usage:
  node _analysis/dual-png-diff.mjs --actual actual.png --expected expected.png [--out diff.png] [--threshold 0]

Options:
  --actual <file>       Actual PNG file.
  --expected <file>     Expected/reference PNG file.
  --out <file>          Optional visual diff PNG.
  --threshold <0-255>   Per-channel tolerance. Default: 0.
  --fail-over <ratio>   Exit 2 when mismatch ratio is greater than this value.
  --help                Show this help.
`;

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

if (flag("help")) {
  console.log(HELP);
  process.exit(0);
}

const actualPath = arg("actual");
const expectedPath = arg("expected");
const outputPath = arg("out");
const threshold = Number(arg("threshold", 0));
const failOver = arg("fail-over") === "" ? null : Number(arg("fail-over"));
if (!actualPath || !expectedPath) throw new Error("Provide --actual and --expected PNG files");

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const COLOR_CHANNELS = new Map([[0, 1], [2, 3], [4, 2], [6, 4]]);

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function parsePng(filePath) {
  const file = readFileSync(filePath);
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${filePath} is not a PNG`);
  let offset = 8;
  let header;
  const idat = [];
  while (offset < file.length) {
    const length = readUInt32(file, offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    const data = file.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      header = {
        width: readUInt32(data, 0),
        height: readUInt32(data, 4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!header) throw new Error(`${filePath} has no IHDR chunk`);
  if (header.bitDepth !== 8 || header.interlace !== 0 || header.compression !== 0 || header.filter !== 0) {
    throw new Error(`${filePath} must be an 8-bit, non-interlaced PNG`);
  }
  const channels = COLOR_CHANNELS.get(header.colorType);
  if (!channels) throw new Error(`${filePath} uses unsupported color type ${header.colorType}`);
  return { ...header, rgba: unpackScanlines(inflateSync(Buffer.concat(idat)), header, channels) };
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unpackScanlines(raw, header, channels) {
  const stride = header.width * channels;
  const rows = [];
  let rawOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[rawOffset++];
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    const prev = rows[y - 1] || Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const above = prev[x] || 0;
      const upperLeft = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + above) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, above, upperLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG row filter ${filter}`);
    }
    rows.push(row);
  }

  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let y = 0; y < header.height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < header.width; x += 1) {
      const source = x * channels;
      const target = (y * header.width + x) * 4;
      if (header.colorType === 0) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source];
        rgba[target + 2] = row[source];
        rgba[target + 3] = 255;
      } else if (header.colorType === 2) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source + 1];
        rgba[target + 2] = row[source + 2];
        rgba[target + 3] = 255;
      } else if (header.colorType === 4) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source];
        rgba[target + 2] = row[source];
        rgba[target + 3] = row[source + 1];
      } else {
        rgba[target] = row[source];
        rgba[target + 1] = row[source + 1];
        rgba[target + 2] = row[source + 2];
        rgba[target + 3] = row[source + 3];
      }
    }
  }
  return rgba;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(body), 8 + data.length);
  return output;
}

function encodeRgbaPng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const actual = parsePng(actualPath);
const expected = parsePng(expectedPath);
const width = Math.min(actual.width, expected.width);
const height = Math.min(actual.height, expected.height);
let mismatchedPixels = 0;
let maxDelta = 0;
let totalDelta = 0;
const diff = Buffer.alloc(width * height * 4);

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const actualOffset = (y * actual.width + x) * 4;
    const expectedOffset = (y * expected.width + x) * 4;
    const diffOffset = (y * width + x) * 4;
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(actual.rgba[actualOffset + channel] - expected.rgba[expectedOffset + channel]);
      pixelDelta = Math.max(pixelDelta, delta);
      maxDelta = Math.max(maxDelta, delta);
      totalDelta += delta;
    }
    if (pixelDelta > threshold) {
      mismatchedPixels += 1;
      diff[diffOffset] = 255;
      diff[diffOffset + 1] = Math.max(0, 255 - pixelDelta);
      diff[diffOffset + 2] = Math.max(0, 255 - pixelDelta);
      diff[diffOffset + 3] = 255;
    } else {
      diff[diffOffset] = expected.rgba[expectedOffset] / 2 + actual.rgba[actualOffset] / 2;
      diff[diffOffset + 1] = expected.rgba[expectedOffset + 1] / 2 + actual.rgba[actualOffset + 1] / 2;
      diff[diffOffset + 2] = expected.rgba[expectedOffset + 2] / 2 + actual.rgba[actualOffset + 2] / 2;
      diff[diffOffset + 3] = 255;
    }
  }
}

if (outputPath) writeFileSync(outputPath, encodeRgbaPng(width, height, diff));

const comparedPixels = width * height;
const dimensionMatch = actual.width === expected.width && actual.height === expected.height;
const summary = {
  actual: actualPath,
  expected: expectedPath,
  width,
  height,
  actualSize: { width: actual.width, height: actual.height },
  expectedSize: { width: expected.width, height: expected.height },
  dimensionMatch,
  comparedPixels,
  mismatchedPixels,
  mismatchRatio: comparedPixels ? mismatchedPixels / comparedPixels : 0,
  maxDelta,
  averageChannelDelta: comparedPixels ? totalDelta / (comparedPixels * 4) : 0,
  threshold,
  diff: outputPath || undefined,
};

console.log(JSON.stringify(summary, null, 2));
if (!dimensionMatch || (failOver !== null && summary.mismatchRatio > failOver)) process.exitCode = 2;
