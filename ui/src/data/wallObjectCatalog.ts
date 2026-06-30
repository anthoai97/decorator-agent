import type {
  WallObjectDefinition,
  WallObjectId,
  WallObjectLayoutItem,
  WallObjectLayoutMap,
} from '../domain/types';

export const wallObjectCatalog: WallObjectDefinition[] = [
  {
    id: 'window',
    name: 'Window',
    wallId: 'back',
    movable: true,
    defaultPosition: { u: -2.1, y: 1.7 },
    size: { width: 1.52, height: 1.02, depth: 0.05 },
    normalOffset: 0.071,
  },
  {
    id: 'wall-art',
    name: 'Wall art',
    wallId: 'back',
    movable: true,
    defaultPosition: { u: 1.85, y: 1.55 },
    size: { width: 1, height: 0.72, depth: 0.075 },
    normalOffset: 0.09,
  },
];

function requireCatalogItem(id: WallObjectId): WallObjectDefinition {
  const item = wallObjectCatalog.find((catalogItem) => catalogItem.id === id);

  if (!item) {
    throw new Error(`Missing wall object catalog item: ${id}`);
  }

  return item;
}

function createLayoutItem(item: WallObjectDefinition): WallObjectLayoutItem {
  const layoutItem: WallObjectLayoutItem = {
    id: item.id,
    name: item.name,
    wallId: item.wallId,
    movable: item.movable,
    position: { ...item.defaultPosition },
    size: { ...item.size },
    normalOffset: item.normalOffset,
  };

  if (item.artifactId) {
    layoutItem.artifactId = item.artifactId;
  }

  return layoutItem;
}

export function createInitialWallObjectLayout(): WallObjectLayoutMap {
  return {
    window: createLayoutItem(requireCatalogItem('window')),
    'wall-art': createLayoutItem(requireCatalogItem('wall-art')),
  };
}
