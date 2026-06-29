import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  connectServerEvents,
  fetchEventHistory,
  fetchServerState,
  parseServerEvent,
  runAgentPlaceholder,
  sendPlaygroundCommand,
  sendServerCommand,
} from './serverEvents';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('serverEvents', () => {
  it('posts playground commands and returns the server event', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          event: {
            id: 'event-1',
            type: 'playground.command.accepted',
            source: 'server',
            message: 'Server accepted SET_FURNITURE_ROTATION',
            command: {
              type: 'SET_FURNITURE_ROTATION',
              payload: { furnitureId: 'sofa', rotationYDegrees: 45 },
            },
          },
        }),
        { status: 200 },
      ),
    );

    const event = await sendPlaygroundCommand({
      type: 'SET_FURNITURE_ROTATION',
      payload: { furnitureId: 'sofa', rotationYDegrees: 45 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/playground/commands',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'SET_FURNITURE_ROTATION',
          payload: { furnitureId: 'sofa', rotationYDegrees: 45 },
        }),
      }),
    );
    expect(event.message).toBe('Server accepted SET_FURNITURE_ROTATION');
  });

  it('posts rotation commands with the current furniture position', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          event: {
            id: 'event-1',
            type: 'playground.command.accepted',
            source: 'server',
            message: 'Server accepted SET_FURNITURE_ROTATION',
          },
        }),
        { status: 200 },
      ),
    );

    await sendPlaygroundCommand({
      type: 'SET_FURNITURE_ROTATION',
      payload: {
        furnitureId: 'coffee-table',
        rotationYDegrees: 45,
        position: { x: 1.2, z: 1.6 },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/playground/commands',
      expect.objectContaining({
        body: JSON.stringify({
          type: 'SET_FURNITURE_ROTATION',
          payload: {
            furnitureId: 'coffee-table',
            rotationYDegrees: 45,
            position: { x: 1.2, z: 1.6 },
          },
        }),
      }),
    );
  });

  it('fetches the server-owned room state', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787/');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          state: { revision: 2, room: {}, furniture: {}, objectives: [] },
          revision: 2,
          lastEventId: 7,
        }),
        { status: 200 },
      ),
    );

    const response = await fetchServerState();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/api/state');
    expect(response.revision).toBe(2);
    expect(response.lastEventId).toBe(7);
  });

  it('posts canonical server commands and returns the command result', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            accepted: true,
            revision: 3,
            commandId: 9,
            events: [{ id: 12, type: 'room.state.patch', source: 'server', revision: 3 }],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await sendServerCommand({
      type: 'MOVE_FURNITURE',
      payload: { furnitureId: 'coffee-table', position: { x: 1.2, z: 1.6 } },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/commands',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.accepted).toBe(true);
    expect(result.events[0].id).toBe(12);
  });

  it('fetches event history after an event id', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ events: [{ id: 2, type: 'room.state.patch' }], lastEventId: 2 }), {
        status: 200,
      }),
    );

    const response = await fetchEventHistory(1);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/api/events/history?after=1');
    expect(response.events[0].id).toBe(2);
  });

  it('opens an EventSource stream with a since cursor', () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787/');
    const urls: string[] = [];

    vi.stubGlobal('EventSource', class {
      constructor(url: string) {
        urls.push(url);
      }

      close() {}
    });

    connectServerEvents(4);

    expect(urls).toEqual(['http://127.0.0.1:8787/api/events?since=4']);
  });

  it('parses server-sent event payloads', () => {
    const event = parseServerEvent({
      data: JSON.stringify({ id: 2, type: 'room.state.patch', revision: 4 }),
    } as MessageEvent<string>);

    expect(event).toEqual({ id: 2, type: 'room.state.patch', revision: 4 });
  });

  it('posts agent placeholder requests', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          event: {
            id: 'event-2',
            type: 'agent.placeholder.completed',
            source: 'server',
            message: 'Agent placeholder received the request.',
            request: { message: 'Arrange the room' },
          },
        }),
        { status: 200 },
      ),
    );

    const event = await runAgentPlaceholder('Arrange the room');

    expect(event.type).toBe('agent.placeholder.completed');
  });

  it('throws server validation errors', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Command payload must be an object when provided',
          },
        }),
        { status: 422 },
      ),
    );

    await expect(
      sendPlaygroundCommand({ type: 'RESET_LAYOUT', payload: {} }),
    ).rejects.toThrow('Command payload must be an object when provided');
  });

  it('throws canonical server command errors', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'COMMAND_REJECTED',
            message: 'Command rejected: furniture would overlap',
          },
        }),
        { status: 422 },
      ),
    );

    await expect(
      sendServerCommand({
        type: 'MOVE_FURNITURE',
        payload: { furnitureId: 'coffee-table', position: { x: 0, z: 0 } },
      }),
    ).rejects.toThrow('Command rejected: furniture would overlap');
  });

  it('requires an explicit server URL before sending requests', async () => {
    await expect(
      sendPlaygroundCommand({ type: 'RESET_LAYOUT', payload: {} }),
    ).rejects.toThrow('Agent server URL is not configured');

    expect(() => connectServerEvents()).toThrow('Agent server URL is not configured');
  });
});
