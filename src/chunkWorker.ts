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
    );
    transferPayload(payload);
  } catch (error) {
    const out: WorkerOut = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(out);
  }
};