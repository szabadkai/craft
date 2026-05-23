export type StreamingStats = {
  incomingResults: number;
  deferredDisposals: number;
  chunkReceivesLastFrame: number;
  chunkReceiveMsLastFrame: number;
  chunkReceiveMsWorst: number;
  chunkDisposeMsLastFrame: number;
  farTerrainMsLast: number;
  farTerrainMsWorst: number;
  farTerrainDisposeMsLast: number;
  farTerrainDisposeMsWorst: number;
};

export function createStreamingStats(): StreamingStats {
  return {
    incomingResults: 0,
    deferredDisposals: 0,
    chunkReceivesLastFrame: 0,
    chunkReceiveMsLastFrame: 0,
    chunkReceiveMsWorst: 0,
    chunkDisposeMsLastFrame: 0,
    farTerrainMsLast: 0,
    farTerrainMsWorst: 0,
    farTerrainDisposeMsLast: 0,
    farTerrainDisposeMsWorst: 0,
  };
}
