/// <reference types="vite/client" />

import type { ImportResult, RoomLayoutExport } from './domain/types';

declare global {
  interface Window {
    __roomComposerDebug?: {
      hasAnyOverlap: () => boolean;
      exportLayout: () => RoomLayoutExport;
      importLayout: (layout: unknown) => ImportResult;
      furniture: () => Array<{
        id: string;
        name: string;
        x: number;
        z: number;
        rotation: number;
      }>;
      wallObjects: () => Array<{
        id: string;
        name: string;
        wallId: string;
        u: number;
        y: number;
      }>;
      wallObjectScreenTargets?: () => Array<{
        id: string;
        name: string;
        x: number;
        y: number;
      }>;
    };
  }
}

export {};
