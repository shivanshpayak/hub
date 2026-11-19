import { modelSrc } from "./content";
import { decodeModel, type ModelGeometry } from "./modelFormat";

/*
 * Fetching and unpacking a page's 3D models (modelFormat.ts), ready for
 * modelScene.ts to draw. Each file is fetched once per visit, however many
 * times it's on the page.
 */

/** A model ready to draw: every triangle's three corners, each with the
 *  direction it faces, for lighting */
export type ModelMesh = { positions: Float32Array; normals: Float32Array; triangles: number };

/** Faces meeting at less than this many degrees look smooth; any sharper
 *  and the edge between them stays sharp, like CAD */
const CREASE_DEGREES = 40;

/**
 * Each corner's normal: the average of the faces around that point that sit
 * within CREASE_DEGREES of the corner's own face, weighted by their size. So
 * a cylinder's sides look round while its ends keep a crisp rim.
 */
function shade({ positions, indices }: ModelGeometry): ModelMesh {
  const triangles = indices.length / 3;
  const corners = positions.length / 3;

  // Each face's normal, as long as twice its area, and the unit one
  const face = new Float32Array(triangles * 3);
  const unit = new Float32Array(triangles * 3);
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    face[t * 3] = nx;
    face[t * 3 + 1] = ny;
    face[t * 3 + 2] = nz;
    const length = Math.hypot(nx, ny, nz);
    if (length > 0) {
      unit[t * 3] = nx / length;
      unit[t * 3 + 1] = ny / length;
      unit[t * 3 + 2] = nz / length;
    }
  }

  // Which faces touch each corner
  const start = new Uint32Array(corners + 1);
  for (let i = 0; i < indices.length; i++) start[indices[i] + 1]++;
  for (let v = 0; v < corners; v++) start[v + 1] += start[v];
  const next = start.slice(0, corners);
  const around = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) around[next[indices[i]]++] = (i / 3) | 0;

  const limit = Math.cos((CREASE_DEGREES * Math.PI) / 180);
  const outPositions = new Float32Array(triangles * 9);
  const outNormals = new Float32Array(triangles * 9);
  for (let t = 0; t < triangles; t++) {
    const tx = unit[t * 3];
    const ty = unit[t * 3 + 1];
    const tz = unit[t * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k];
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let j = start[v]; j < start[v + 1]; j++) {
        const f = around[j];
        if (unit[f * 3] * tx + unit[f * 3 + 1] * ty + unit[f * 3 + 2] * tz >= limit) {
          nx += face[f * 3];
          ny += face[f * 3 + 1];
          nz += face[f * 3 + 2];
        }
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      const out = t * 9 + k * 3;
      outPositions[out] = positions[v * 3];
      outPositions[out + 1] = positions[v * 3 + 1];
      outPositions[out + 2] = positions[v * 3 + 2];
      outNormals[out] = nx / length;
      outNormals[out + 1] = ny / length;
      outNormals[out + 2] = nz / length;
    }
  }
  return { positions: outPositions, normals: outNormals, triangles };
}

async function fetchModel(file: string, onProgress: (fraction: number) => void): Promise<ModelMesh> {
  const res = await fetch(modelSrc(file));
  if (!res.ok || !res.body) throw new Error(`The model answered ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) onProgress(Math.min(1, received / total));
  }
  const packed = new Blob(chunks as BlobPart[]);
  const unpacked = await new Response(packed.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const geometry = decodeModel(unpacked);
  if (!geometry) throw new Error("Not a model");
  return shade(geometry);
}

type Loading = {
  mesh: Promise<ModelMesh>;
  progress: number;
  watchers: Set<(fraction: number) => void>;
};

const loading = new Map<string, Loading>();

/**
 * A model, fetched once however many places ask for it. `onProgress` hears
 * how much has arrived (0 to 1) until it's here or `stop` is called.
 */
export function loadModel(
  file: string,
  onProgress: (fraction: number) => void,
): { mesh: Promise<ModelMesh>; stop: () => void } {
  let entry = loading.get(file);
  if (!entry) {
    const created: Loading = {
      progress: 0,
      watchers: new Set(),
      // Progress only comes after the fetch starts, once `created` is set
      mesh: fetchModel(file, (fraction) => {
        created.progress = fraction;
        created.watchers.forEach((watch) => watch(fraction));
      }),
    };
    // A failed one is fetched afresh next time
    created.mesh.catch(() => loading.delete(file));
    loading.set(file, created);
    entry = created;
  }
  const current = entry;
  current.watchers.add(onProgress);
  onProgress(current.progress);
  const stop = () => current.watchers.delete(onProgress);
  void current.mesh.finally(stop).catch(() => undefined);
  return { mesh: current.mesh, stop };
}
