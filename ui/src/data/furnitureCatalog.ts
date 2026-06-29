import { snapDegrees } from '../domain/math';
import type {
  FurnitureDefinition,
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  RoomDefinition,
} from '../domain/types';

export const roomDefinition: RoomDefinition = {
  width: 5.8,
  depth: 4.4,
  height: 2.65,
  bounds: { minX: -2.9, maxX: 2.9, minZ: -2.2, maxZ: 2.2 },
};

export const furnitureCatalog: FurnitureDefinition[] = [
  { id: 'sofa', name: 'Sofa', movable: true, blocksPlacement: true, defaultPosition: { x: -0.9, y: 0, z: -1.4 }, defaultRotationYDegrees: 0, baseSize: { width: 2.49, height: 1.21, depth: 0.93 } },
  { id: 'coffee-table', name: 'Coffee table', movable: true, blocksPlacement: true, defaultPosition: { x: -0.55, y: 0, z: -0.25 }, defaultRotationYDegrees: 0, baseSize: { width: 1.35, height: 0.628, depth: 0.82 } },
  { id: 'lounge-chair', name: 'Lounge chair', movable: true, blocksPlacement: true, defaultPosition: { x: 1.75, y: 0, z: -0.4 }, defaultRotationYDegrees: -31.5, baseSize: { width: 1.273, height: 1.235, depth: 1.303 } },
  { id: 'bookshelf', name: 'Bookshelf', movable: true, blocksPlacement: true, defaultPosition: { x: 2.15, y: 0, z: -1.75 }, defaultRotationYDegrees: 0, baseSize: { width: 0.92, height: 1.56, depth: 0.34 } },
  { id: 'planter', name: 'Planter', movable: true, blocksPlacement: true, defaultPosition: { x: -2.15, y: 0, z: 1.35 }, defaultRotationYDegrees: 0, baseSize: { width: 0.72, height: 1.133, depth: 0.867 } },
  { id: 'rug', name: 'Area rug', movable: true, blocksPlacement: false, defaultPosition: { x: -0.55, y: 0, z: -0.25 }, defaultRotationYDegrees: 0, baseSize: { width: 2.7, height: 0.025, depth: 1.75 } },
];

function requireCatalogItem(id: FurnitureId): FurnitureDefinition {
  const item = furnitureCatalog.find((catalogItem) => catalogItem.id === id);

  if (!item) {
    throw new Error(`Missing furniture catalog item: ${id}`);
  }

  return item;
}

function createLayoutItem(item: FurnitureDefinition): FurnitureLayoutItem {
  return {
    id: item.id,
    name: item.name,
    movable: item.movable,
    blocksPlacement: item.blocksPlacement,
    position: { ...item.defaultPosition },
    rotation: { yDegrees: snapDegrees(item.defaultRotationYDegrees) },
    baseSize: { ...item.baseSize },
  };
}

export function createInitialFurnitureLayout(): FurnitureLayoutMap {
  return {
    sofa: createLayoutItem(requireCatalogItem('sofa')),
    'coffee-table': createLayoutItem(requireCatalogItem('coffee-table')),
    'lounge-chair': createLayoutItem(requireCatalogItem('lounge-chair')),
    bookshelf: createLayoutItem(requireCatalogItem('bookshelf')),
    planter: createLayoutItem(requireCatalogItem('planter')),
    rug: createLayoutItem(requireCatalogItem('rug')),
  };
}
