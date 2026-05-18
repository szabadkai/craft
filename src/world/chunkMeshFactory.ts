import * as THREE from 'three';
import type { ChunkMeshPayload } from '../types';

export type ChunkMeshMaterials = {
  chunk: THREE.ShaderMaterial;
  fade: THREE.ShaderMaterial;
  water: THREE.ShaderMaterial;
  transparent: THREE.ShaderMaterial;
  deco: THREE.ShaderMaterial;
};

export type ChunkMeshes = {
  mesh: THREE.Mesh;
  waterMesh: THREE.Mesh | null;
  transparentMesh: THREE.Mesh | null;
  decoMesh: THREE.Mesh | null;
};

export function buildChunkMeshes(
  payload: ChunkMeshPayload,
  materials: ChunkMeshMaterials,
  isRemesh: boolean,
): ChunkMeshes {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(payload.colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(payload.uvs, 2));
  geometry.setAttribute('atlasRect', new THREE.BufferAttribute(payload.atlas, 4));
  geometry.setAttribute('light', new THREE.BufferAttribute(payload.lights, 2));
  geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, isRemesh ? materials.chunk : materials.fade.clone());
  mesh.frustumCulled = true;
  mesh.userData.birth = performance.now();

  const waterMesh = payload.waterPositions && payload.waterNormals && payload.waterIndices
    ? buildWaterMesh(payload, materials.water)
    : null;
  const transparentMesh = payload.transparentPositions && payload.transparentNormals &&
    payload.transparentColors && payload.transparentUvs && payload.transparentAtlas &&
    payload.transparentIndices
    ? buildTexturedMesh(
        payload.transparentPositions,
        payload.transparentNormals,
        payload.transparentColors,
        payload.transparentUvs,
        payload.transparentAtlas,
        payload.transparentLights,
        payload.transparentIndices,
        materials.transparent,
      )
    : null;
  const decoMesh = payload.decoPositions && payload.decoNormals && payload.decoColors &&
    payload.decoUvs && payload.decoAtlas && payload.decoIndices
    ? buildTexturedMesh(
        payload.decoPositions,
        payload.decoNormals,
        payload.decoColors,
        payload.decoUvs,
        payload.decoAtlas,
        payload.decoLights,
        payload.decoIndices,
        materials.deco,
      )
    : null;

  return { mesh, waterMesh, transparentMesh, decoMesh };
}

function buildWaterMesh(payload: ChunkMeshPayload, material: THREE.ShaderMaterial): THREE.Mesh {
  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.BufferAttribute(payload.waterPositions!, 3));
  waterGeo.setAttribute('normal', new THREE.BufferAttribute(payload.waterNormals!, 3));
  if (payload.waterLights) waterGeo.setAttribute('light', new THREE.BufferAttribute(payload.waterLights, 2));
  waterGeo.setIndex(new THREE.BufferAttribute(payload.waterIndices!, 1));
  waterGeo.computeBoundingSphere();
  const mesh = new THREE.Mesh(waterGeo, material);
  mesh.renderOrder = 1;
  mesh.frustumCulled = true;
  return mesh;
}

function buildTexturedMesh(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  uvs: Float32Array,
  atlas: Float32Array,
  lights: Float32Array | null,
  indices: Uint32Array,
  material: THREE.ShaderMaterial,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('atlasRect', new THREE.BufferAttribute(atlas, 4));
  if (lights) geo.setAttribute('light', new THREE.BufferAttribute(lights, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  mesh.frustumCulled = true;
  return mesh;
}
