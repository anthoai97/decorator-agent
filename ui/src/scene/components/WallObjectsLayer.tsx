import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

import { roomDefinition } from '../../data/furnitureCatalog';
import type { WallObjectLayoutItem, WallObjectLayoutMap } from '../../domain/types';
import { getWallObjectWorldTransform } from '../../domain/wallObjectPlacement';
import { useRoomStore } from '../../state/useRoomStore';
import type { WallObjectDragApi } from '../interactions/useWallObjectDrag';
import type { OpenWallIds } from '../roomView';
import { WallArt } from './WallArt';
import { WallObjectItem } from './WallObjectItem';
import { WallWindow } from './WallWindow';

interface WallObjectsLayerProps {
  openWallIds: OpenWallIds;
  drag: WallObjectDragApi;
}

export function getVisibleWallObjects(
  wallObjects: WallObjectLayoutMap,
  openWallIds: OpenWallIds,
): WallObjectLayoutItem[] {
  const openWallIdSet = new Set(openWallIds);
  return Object.values(wallObjects).filter((item) => !openWallIdSet.has(item.wallId));
}

export function WallObjectsLayer({ openWallIds, drag }: WallObjectsLayerProps) {
  const { camera, size } = useThree();
  const wallObjects = useRoomStore((state) => state.wallObjects);
  const visibleWallObjects = getVisibleWallObjects(wallObjects, openWallIds);

  useEffect(() => {
    if (!import.meta.env.DEV || !window.__roomComposerDebug) {
      return;
    }

    window.__roomComposerDebug.wallObjectScreenTargets = () =>
      visibleWallObjects.map((item) => {
        const transform = getWallObjectWorldTransform(item, roomDefinition);
        const projected = new Vector3(...transform.position).project(camera);

        return {
          id: item.id,
          name: item.name,
          x: Math.round(((projected.x + 1) / 2) * size.width),
          y: Math.round(((-projected.y + 1) / 2) * size.height),
        };
      });

    return () => {
      if (window.__roomComposerDebug) {
        delete window.__roomComposerDebug.wallObjectScreenTargets;
      }
    };
  }, [camera, size.height, size.width, visibleWallObjects]);

  return (
    <group name="Wall objects">
      {visibleWallObjects.map((item) => (
        <WallObjectItem key={item.id} item={item} drag={drag}>
          {item.id === 'window' ? <WallWindow /> : <WallArt />}
        </WallObjectItem>
      ))}
    </group>
  );
}
