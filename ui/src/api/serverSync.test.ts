import { describe, expect, it, vi } from 'vitest';

import { startServerStateSync } from './serverSync';
import type { ServerStateResponse, ServerStreamEvent } from './serverEvents';

function createSnapshot(lastEventId = 3): ServerStateResponse {
  return {
    revision: 3,
    lastEventId,
    state: {
      revision: 3,
      room: { width: 9.6, depth: 6.8, height: 2.75, bounds: { minX: -4.8, maxX: 4.8, minZ: -3.4, maxZ: 3.4 } },
      furniture: {} as ServerStateResponse['state']['furniture'],
      objectives: [],
    },
  };
}

describe('serverSync', () => {
  it('hydrates the server snapshot and connects from the last event id', async () => {
    const hydrateServerState = vi.fn();
    const applyServerEvent = vi.fn();
    const showLayoutStatus = vi.fn();
    const connectedSince: Array<number | undefined> = [];

    const handle = startServerStateSync({
      fetchState: async () => createSnapshot(7),
      connectEvents: (since) => {
        connectedSince.push(since);
        return { addEventListener: vi.fn(), close: vi.fn() } as unknown as EventSource;
      },
      parseEvent: vi.fn(),
      store: { hydrateServerState, applyServerEvent, showLayoutStatus },
    });

    await handle.ready;

    expect(hydrateServerState).toHaveBeenCalledWith(createSnapshot(7));
    expect(connectedSince).toEqual([7]);
    expect(showLayoutStatus).not.toHaveBeenCalled();
  });

  it('applies server-sent messages to the store', async () => {
    const serverEvent: ServerStreamEvent = { id: 8, type: 'room.state.patch', revision: 4 };
    const applyServerEvent = vi.fn();
    let stream: EventSource | undefined;

    const handle = startServerStateSync({
      fetchState: async () => createSnapshot(7),
      connectEvents: () => {
        stream = { addEventListener: vi.fn(), close: vi.fn(), onmessage: null } as unknown as EventSource;
        return stream;
      },
      parseEvent: () => serverEvent,
      store: {
        hydrateServerState: vi.fn(),
        applyServerEvent,
        showLayoutStatus: vi.fn(),
      },
    });

    await handle.ready;
    stream?.onmessage?.({ data: JSON.stringify(serverEvent) } as MessageEvent<string>);

    expect(applyServerEvent).toHaveBeenCalledWith(serverEvent);
  });

  it('listens for named SSE state events', async () => {
    const serverEvent: ServerStreamEvent = { id: 9, type: 'room.state.snapshot', revision: 5 };
    const applyServerEvent = vi.fn();
    const listeners = new Map<string, EventListener>();

    const handle = startServerStateSync({
      fetchState: async () => createSnapshot(8),
      connectEvents: () => ({
        addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
        close: vi.fn(),
      } as unknown as EventSource),
      parseEvent: () => serverEvent,
      store: {
        hydrateServerState: vi.fn(),
        applyServerEvent,
        showLayoutStatus: vi.fn(),
      },
    });

    await handle.ready;
    listeners.get('room.state.snapshot')?.({ data: JSON.stringify(serverEvent) } as MessageEvent<string>);

    expect([...listeners.keys()]).toEqual(['room.state.patch', 'room.state.snapshot', 'command.rejected']);
    expect(applyServerEvent).toHaveBeenCalledWith(serverEvent);
  });

  it('keeps local mode quiet when the server URL is not configured', async () => {
    const showLayoutStatus = vi.fn();

    const handle = startServerStateSync({
      fetchState: async () => {
        throw new Error('Agent server URL is not configured');
      },
      connectEvents: vi.fn(),
      parseEvent: vi.fn(),
      store: {
        hydrateServerState: vi.fn(),
        applyServerEvent: vi.fn(),
        showLayoutStatus,
      },
    });

    await handle.ready;

    expect(showLayoutStatus).not.toHaveBeenCalled();
  });

  it('shows a disconnected status when startup fails for another reason', async () => {
    const showLayoutStatus = vi.fn();

    const handle = startServerStateSync({
      fetchState: async () => {
        throw new Error('Server unavailable');
      },
      connectEvents: vi.fn(),
      parseEvent: vi.fn(),
      store: {
        hydrateServerState: vi.fn(),
        applyServerEvent: vi.fn(),
        showLayoutStatus,
      },
    });

    await handle.ready;

    expect(showLayoutStatus).toHaveBeenCalledWith('Server unavailable; using local state');
  });
});
