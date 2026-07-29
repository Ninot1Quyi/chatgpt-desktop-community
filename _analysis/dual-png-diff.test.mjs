import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import test from "node:test";
import assert from "node:assert/strict";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("dual-png-diff reports mismatches and writes a diff PNG", () => {
  const dir = mkdtempSync(join(tmpdir(), "dual-png-diff-"));
  const expected = join(dir, "expected.png");
  const actual = join(dir, "actual.png");
  const diff = join(dir, "diff.png");
  writeFileSync(expected, png(2, 1, Buffer.from([
    0, 0, 0, 255,
    255, 255, 255, 255,
  ])));
  writeFileSync(actual, png(2, 1, Buffer.from([
    0, 0, 0, 255,
    250, 255, 255, 255,
  ])));
  const output = execFileSync(process.execPath, [
    "_analysis/dual-png-diff.mjs",
    "--actual", actual,
    "--expected", expected,
    "--out", diff,
    "--threshold", "0",
  ], { encoding: "utf8" });
  const summary = JSON.parse(output);
  assert.equal(summary.comparedPixels, 2);
  assert.equal(summary.mismatchedPixels, 1);
  assert.equal(summary.dimensionMatch, true);
  assert.ok(readFileSync(diff).subarray(0, 8).equals(SIGNATURE));
});
