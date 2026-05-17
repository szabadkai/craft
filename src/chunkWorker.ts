import { buildChunkMesh } from './mesh';
import { makeChunkBlocks } from './terrain';
import { WorkerIn, WorkerOut } from './types';

function transferPayload(payload: ReturnType<typeof buildChunkMesh>) {
  const transfers: ArrayBuffer[] = [
    payload.blocks.buffer as ArrayBuffer,
    payload.positions.buffer as ArrayBuffer,
    payload.normals.buffer as ArrayBuffer,
    payload.colors.buffer as ArrayBuffer,
    payload.uvs.buffer as ArrayBuffer,
    payload.atlas.buffer as ArrayBuffer,
    payload.indices.buffer as ArrayBuffer,
  ];
  if (payload.waterPositions) transfers.push(payload.waterPositions.buffer as ArrayBuffer);
  if (payload.waterNormals) transfers.push(payload.waterNormals.buffer as ArrayBuffer);
  if (payload.waterIndices) transfers.push(payload.waterIndices.buffer as ArrayBuffer);
  if (payload.transparentPositions) transfers.push(payload.transparentPositions.buffer as ArrayBuffer);
  if (payload.transparentNormals) transfers.push(payload.transparentNormals.buffer as ArrayBuffer);
  if (payload.transparentColors) transfers.push(payload.transparentColors.buffer as ArrayBuffer);
  if (payload.transparentUvs) transfers.push(payload.transparentUvs.buffer as ArrayBuffer);
  if (payload.transparentAtlas) transfers.push(payload.transparentAtlas.buffer as ArrayBuffer);
  if (payload.transparentIndices) transfers.push(payload.transparentIndices.buffer as ArrayBuffer);
  if (payload.decoPositions) transfers.push(payload.decoPositions.buffer as ArrayBuffer);
  if (payload.decoNormals) transfers.push(payload.decoNormals.buffer as ArrayBuffer);
  if (payload.decoColors) transfers.push(payload.decoColors.buffer as ArrayBuffer);
  if (payload.decoUvs) transfers.push(payload.decoUvs.buffer as ArrayBuffer);
  if (payload.decoAtlas) transfers.push(payload.decoAtlas.buffer as ArrayBuffer);
  if (payload.decoIndices) transfers.push(payload.decoIndices.buffer as ArrayBuffer);
  const out: WorkerOut = { type: 'chunk', payload };
  self.postMessage(out, transfers);
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  try {
    if (event.data.type === 'generate') {
      const blocks = makeChunkBlocks(event.data.cx, event.data.cz, event.data.seed);
      const payload = buildChunkMesh(event.data.cx, event.data.cz, event.data.seed, blocks);
      transferPayload(payload);
      return;
    }
    const payload = buildChunkMesh(
      event.data.cx,
      event.data.cz,
      event.data.seed,
      event.data.blocks,
      event.data.neighbors,
    );
    transferPayload(payload);
  } catch (error) {
    const out: WorkerOut = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      cx: event.data.cx,
      cz: event.data.cz,
    };
    self.postMessage(out);
  }
};