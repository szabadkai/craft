import { buildChunkMesh } from './mesh';
import { makeChunkBlocks } from './terrain';
import { WorkerIn, WorkerOut } from './types';

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  try {
    if (event.data.type === 'generate') {
      const blocks = makeChunkBlocks(event.data.cx, event.data.cz, event.data.seed);
      const payload = buildChunkMesh(event.data.cx, event.data.cz, event.data.seed, blocks);
      const out: WorkerOut = { type: 'chunk', payload };
      self.postMessage(out, [
        payload.blocks.buffer,
        payload.positions.buffer,
        payload.normals.buffer,
        payload.colors.buffer,
        payload.uvs.buffer,
        payload.atlas.buffer,
        payload.indices.buffer,
      ]);
      return;
    }
    const payload = buildChunkMesh(
      event.data.cx,
      event.data.cz,
      event.data.seed,
      event.data.blocks,
    );
    const out: WorkerOut = { type: 'chunk', payload };
    self.postMessage(out, [
      payload.blocks.buffer,
      payload.positions.buffer,
      payload.normals.buffer,
      payload.colors.buffer,
      payload.uvs.buffer,
      payload.atlas.buffer,
      payload.indices.buffer,
    ]);
  } catch (error) {
    const out: WorkerOut = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(out);
  }
};
