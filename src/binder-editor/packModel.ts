import { MAX_PACKED_BYTES, MAX_TRIANGLES, encodeModel, type ModelGeometry } from "../binder/modelFormat";

/*
 * Turns an .stl from CAD into the binder's packed model (modelFormat.ts)
 * before it's uploaded: reads binary or text .stl files, joins the corners
 * that triangles share, drops triangles with no area, and gzips the lot.
 * Loaded only when an editor adds a model.
 */

/** The biggest .stl this reads. A binary one this size has about 8 million
 *  triangles, far over MAX_TRIANGLES, so it would be refused anyway */
const MAX_STL_BYTES = 400 * 1024 * 1024;

const COARSER = "Export it at a coarser resolution, or just part of the robot.";

type Problem = { error: string };

function tooMany(name: string, triangles: number): Problem {
  return {
    error: `${name} has ${triangles.toLocaleString("en-US")} triangles, and a model can have up to ${MAX_TRIANGLES.toLocaleString("en-US")}. ${COARSER}`,
  };
}

const broken = (name: string): Problem => ({
  error: `${name} has numbers in it that aren't numbers. Export it again.`,
});

/** A binary .stl: an 80 byte header, a count, then 50 bytes a triangle
 *  (a normal, which is skipped, three corners and two spare bytes) */
function readBinary(view: DataView, count: number, name: string): Float32Array | Problem {
  if (count > MAX_TRIANGLES) return tooMany(name, count);
  const corners = new Float32Array(count * 9);
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k++) {
      const value = view.getFloat32(at + k * 4, true);
      if (!Number.isFinite(value)) return broken(name);
      corners[t * 9 + k] = value;
    }
  }
  return corners;
}

/** A text .stl: every "vertex x y z", read a slice at a time so a big file
 *  never has to be one string */
function readText(bytes: Uint8Array, name: string): Float32Array | Problem {
  const SLICE = 16 * 1024 * 1024;
  const vertex = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  const decoder = new TextDecoder();
  let corners = new Float32Array(1 << 20);
  let used = 0;
  // Every corner is counted, but only as many as a model can have are kept
  let seen = 0;
  let carry = "";
  for (let at = 0; at < bytes.length; at += SLICE) {
    const last = at + SLICE >= bytes.length;
    const text = carry + decoder.decode(bytes.subarray(at, at + SLICE), { stream: !last });
    // Whole lines only; the rest goes with the next slice
    const cut = last ? text.length : text.lastIndexOf("\n") + 1;
    carry = text.slice(cut);
    for (const match of text.slice(0, cut).matchAll(vertex)) {
      if (++seen > MAX_TRIANGLES * 3) continue;
      if (used + 3 > corners.length) {
        const bigger = new Float32Array(Math.min(corners.length * 2, MAX_TRIANGLES * 9));
        bigger.set(corners);
        corners = bigger;
      }
      for (let k = 1; k <= 3; k++) {
        const value = Number(match[k]);
        if (!Number.isFinite(value)) return broken(name);
        corners[used++] = value;
      }
    }
  }
  if (seen > MAX_TRIANGLES * 3) return tooMany(name, Math.floor(seen / 3));
  return corners.subarray(0, used - (used % 9));
}

/** Every triangle's corners, three numbers each, from either kind of .stl */
function readStl(buffer: ArrayBuffer, name: string): Float32Array | Problem {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const count = buffer.byteLength >= 84 ? view.getUint32(80, true) : -1;
  // A binary file's size gives it away (its header can start with "solid" too)
  if (count >= 0 && 84 + count * 50 === buffer.byteLength) return readBinary(view, count, name);
  const start = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  if (start.startsWith("solid")) {
    const corners = readText(bytes, name);
    if ("error" in corners || corners.length > 0) return corners;
  }
  // A binary file with something extra on the end
  if (count > 0 && 84 + count * 50 <= buffer.byteLength) return readBinary(view, count, name);
  return { error: `${name} doesn't look like an .stl file.` };
}

/**
 * Joins corners that are in the same place, so each is kept once, and drops
 * triangles with two corners on one point. Corners match when their numbers
 * are exactly the same, which CAD programs make sure of.
 */
function shareCorners(corners: Float32Array): ModelGeometry {
  const count = corners.length / 3;
  const bits = new Uint32Array(corners.buffer, corners.byteOffset, corners.length);
  let size = 1;
  while (size < count * 1.5) size *= 2;
  const mask = size - 1;
  const table = new Int32Array(size).fill(-1);
  const kept = new Uint32Array(corners.length);
  const which = new Uint32Array(count);
  let unique = 0;
  for (let c = 0; c < count; c++) {
    // -0 and 0 are the same place
    const x = bits[c * 3] === 0x80000000 ? 0 : bits[c * 3];
    const y = bits[c * 3 + 1] === 0x80000000 ? 0 : bits[c * 3 + 1];
    const z = bits[c * 3 + 2] === 0x80000000 ? 0 : bits[c * 3 + 2];
    let slot = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
    slot = (slot ^ (slot >>> 15)) & mask;
    for (;;) {
      const found = table[slot];
      if (found === -1) {
        table[slot] = unique;
        kept[unique * 3] = x;
        kept[unique * 3 + 1] = y;
        kept[unique * 3 + 2] = z;
        which[c] = unique++;
        break;
      }
      if (kept[found * 3] === x && kept[found * 3 + 1] === y && kept[found * 3 + 2] === z) {
        which[c] = found;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }
  const indices = new Uint32Array(count);
  let used = 0;
  for (let c = 0; c < count; c += 3) {
    const a = which[c];
    const b = which[c + 1];
    const d = which[c + 2];
    if (a === b || b === d || a === d) continue;
    indices[used++] = a;
    indices[used++] = b;
    indices[used++] = d;
  }
  return {
    positions: new Float32Array(kept.buffer, 0, unique * 3).slice(),
    indices: indices.slice(0, used),
  };
}

async function gzip(buffer: ArrayBuffer): Promise<Blob> {
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

export type PackedModel = { blob: Blob; triangles: number };

/** An .stl, packed and ready to upload, or what's wrong with it */
export async function packStl(file: File): Promise<PackedModel | Problem> {
  const name = file.name;
  if (file.size === 0) return { error: `${name} is empty.` };
  if (file.size > MAX_STL_BYTES) return { error: `${name} is over 400 MB. ${COARSER}` };
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { error: `${name} couldn't be read.` };
  }
  const corners = readStl(buffer, name);
  if ("error" in corners) return corners;
  const geometry = shareCorners(corners);
  const triangles = geometry.indices.length / 3;
  if (triangles === 0) return { error: `${name} has no triangles in it.` };
  const blob = await gzip(encodeModel(geometry));
  if (blob.size > MAX_PACKED_BYTES) {
    return {
      error: `${name} is ${megabytes(blob.size)} MB even packed down, and a model can be up to ${megabytes(MAX_PACKED_BYTES)} MB. ${COARSER}`,
    };
  }
  return { blob, triangles };
}
