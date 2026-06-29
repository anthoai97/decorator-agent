import { useRoomStore } from '../state/useRoomStore';
import {
  connectServerEvents,
  fetchServerState,
  parseServerEvent,
  type ServerStateResponse,
  type ServerStreamEvent,
} from './serverEvents';

interface ServerSyncStore {
  hydrateServerState: (snapshot: ServerStateResponse) => void;
  applyServerEvent: (event: ServerStreamEvent) => void;
  showLayoutStatus: (message: string) => void;
}

interface ServerSyncDependencies {
  fetchState?: () => Promise<ServerStateResponse>;
  connectEvents?: (since?: number) => EventSource;
  parseEvent?: (event: MessageEvent<string>) => ServerStreamEvent;
  store?: ServerSyncStore;
}

interface ServerSyncHandle {
  ready: Promise<void>;
  stop: () => void;
}

const stateEventTypes = ['room.state.patch', 'room.state.snapshot', 'command.rejected'] as const;

export function startServerStateSync(dependencies: ServerSyncDependencies = {}): ServerSyncHandle {
  const fetchState = dependencies.fetchState ?? fetchServerState;
  const connectEvents = dependencies.connectEvents ?? connectServerEvents;
  const parseEvent = dependencies.parseEvent ?? parseServerEvent;
  const store = dependencies.store ?? useRoomStore.getState();
  let stopped = false;
  let stream: EventSource | null = null;

  const ready = (async () => {
    try {
      const snapshot = await fetchState();

      if (stopped) {
        return;
      }

      store.hydrateServerState(snapshot);
      stream = connectEvents(snapshot.lastEventId);
      const handleEvent = (event: MessageEvent<string>) => {
        store.applyServerEvent(parseEvent(event));
      };
      stream.onmessage = handleEvent;
      for (const eventType of stateEventTypes) {
        stream.addEventListener(eventType, handleEvent as EventListener);
      }
      stream.onerror = () => {
        store.showLayoutStatus('Server event stream disconnected');
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Agent server URL is not configured') {
        return;
      }

      store.showLayoutStatus('Server unavailable; using local state');
    }
  })();

  return {
    ready,
    stop: () => {
      stopped = true;
      stream?.close();
    },
  };
}
