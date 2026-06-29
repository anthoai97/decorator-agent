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
    };
  }
}

export {};
