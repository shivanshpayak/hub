import { BINDER_MODEL_MAX_TRIANGLES } from "../../../manu-orders/src/lib/binder-blocks";

/*
 * How the binder keeps a 3D model: an .stl packed down by the editor
 * (binder-editor/packModel.ts) and unpacked by the page (modelData.ts).
 * ManuQueue checks every upload against the same layout
 * (manu-orders/src/lib/binder-images.ts).
 *
 * Gzip of: "LBM1", the number of corners and of triangles (uint32), each
 * corner's x, y and z (float32), then each triangle's three corners
 * (uint32), all little endian. An .stl repeats a corner for every triangle
 * that shares it, so this is a few times smaller even before gzip.
 */

const MAGIC = [0x4c, 0x42, 0x4d, 0x31]; // "LBM1"
const HEADER = 12;

/** The most triangles a model can have (the server's, in its
 *  binder-blocks.ts) */
export const MAX_TRIANGLES = BINDER_MODEL_MAX_TRIANGLES;

/** The most a packed model can weigh. Matches BINDER_MODEL_MAX_BYTES */
export const MAX_PACKED_BYTES = 30 * 1024 * 1024;

/** Corners shared between triangles: x, y, z for each corner, then three
 *  corners for each triangle */
export type ModelGeometry = { positions: Float32Array; indices: Uint32Array };

const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** The model unpacked, before gzip */
export function encodeModel({ positions, indices }: ModelGeometry): ArrayBuffer {
  const corners = positions.length / 3;
  const buffer = new ArrayBuffer(HEADER + positions.byteLength + indices.byteLength);
  const view = new DataView(buffer);
  MAGIC.forEach((byte, i) => view.setUint8(i, byte));
  view.setUint32(4, corners, true);
  view.setUint32(8, indices.length / 3, true);
  const indicesAt = HEADER + positions.byteLength;
  if (littleEndian) {
    new Float32Array(buffer, HEADER, positions.length).set(positions);
    new Uint32Array(buffer, indicesAt, indices.length).set(indices);
  } else {
    positions.forEach((value, i) => view.setFloat32(HEADER + i * 4, value, true));
    indices.forEach((value, i) => view.setUint32(indicesAt + i * 4, value, true));
  }
  return buffer;
}

/** A model from its unpacked bytes, or null if they aren't one */
export function decodeModel(buffer: ArrayBuffer): ModelGeometry | null {
  if (buffer.byteLength < HEADER) return null;
  const view = new DataView(buffer);
  if (MAGIC.some((byte, i) => view.getUint8(i) !== byte)) return null;
  const corners = view.getUint32(4, true);
  const triangles = view.getUint32(8, true);
  const indicesAt = HEADER + corners * 12;
  if (triangles < 1 || triangles > MAX_TRIANGLES || buffer.byteLength !== indicesAt + triangles * 12) {
    return null;
  }
  let positions: Float32Array;
  let indices: Uint32Array;
  if (littleEndian) {
    positions = new Float32Array(buffer, HEADER, corners * 3);
    indices = new Uint32Array(buffer, indicesAt, triangles * 3);
  } else {
    positions = Float32Array.from({ length: corners * 3 }, (_, i) => view.getFloat32(HEADER + i * 4, true));
    indices = Uint32Array.from({ length: triangles * 3 }, (_, i) => view.getUint32(indicesAt + i * 4, true));
  }
  for (let i = 0; i < indices.length; i++) if (indices[i] >= corners) return null;
  return { positions, indices };
}
