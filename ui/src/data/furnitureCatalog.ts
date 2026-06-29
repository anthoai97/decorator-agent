import { snapDegrees } from '../domain/math';
import type {
  FurnitureDefinition,
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  RoomDefinition,
} from '../domain/types';

export const roomDefinition: RoomDefinition = {
  width: 9.6,
  depth: 6.8,
  height: 2.75,
  bounds: { minX: -4.8, maxX: 4.8, minZ: -3.4, maxZ: 3.4 },
};

export const furnitureCatalog: FurnitureDefinition[] = [
  { id: 'sofa', name: 'Sofa', movable: true, blocksPlacement: true, defaultPosition: { x: -1.5, y: 0, z: -1.55 }, defaultRotationYDegrees: 0, baseSize: { width: 2.49, height: 1.21, depth: 0.93 } },
  { id: 'coffee-table', name: 'Coffee table', movable: true, blocksPlacement: true, defaultPosition: { x: 0.55, y: 0, z: 0.25 }, defaultRotationYDegrees: 0, baseSize: { width: 1.35, height: 0.628, depth: 0.82 } },
  { id: 'lounge-chair', name: 'Lounge chair', movable: true, blocksPlacement: true, defaultPosition: { x: 2.1, y: 0, z: -0.65 }, defaultRotationYDegrees: -31.5, baseSize: { width: 1.273, height: 1.235, depth: 1.303 } },
  { id: 'bookshelf', name: 'Bookshelf', movable: true, blocksPlacement: true, defaultPosition: { x: 3.65, y: 0, z: -2.15 }, defaultRotationYDegrees: 0, baseSize: { width: 0.92, height: 1.56, depth: 0.34 } },
  { id: 'planter', name: 'Planter', movable: true, blocksPlacement: true, defaultPosition: { x: -3.55, y: 0, z: -2.25 }, defaultRotationYDegrees: 0, baseSize: { width: 0.72, height: 1.133, depth: 0.867 } },
  { id: 'rug', name: 'Area rug', movable: true, blocksPlacement: false, defaultPosition: { x: 0.45, y: 0, z: 0.3 }, defaultRotationYDegrees: 0, baseSize: { width: 2.7, height: 0.025, depth: 1.75 } },
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
