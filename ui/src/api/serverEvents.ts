import type { FurnitureId, FurnitureLayoutMap, RoomDefinition } from '../domain/types';

export type PlaygroundCommand =
  | { type: 'ADD_OBJECTIVE'; payload: { title: string } }
  | { type: 'DELETE_OBJECTIVE'; payload: { objectiveId: string } }
  | {
      type: 'SET_FURNITURE_ROTATION';
      payload: { furnitureId: FurnitureId; rotationYDegrees: number; position?: { x: number; z: number } };
    }
  | { type: 'RESET_LAYOUT'; payload: Record<string, never> }
  | { type: 'REMOVE_FURNITURE'; payload: { furnitureId: FurnitureId } };

export type ServerCommand =
  | PlaygroundCommand
  | { type: 'MOVE_FURNITURE'; payload: { furnitureId: FurnitureId; position: { x: number; z: number } } };

export interface ServerEvent {
  id: string;
  type: string;
  source: 'server';
  message: string;
  command?: PlaygroundCommand;
  request?: unknown;
}

export interface Objective {
  id: string;
  title: string;
}

export interface ServerRoomState {
  revision: number;
  room: RoomDefinition;
  furniture: FurnitureLayoutMap;
  objectives: Objective[];
}

export interface ServerStateResponse {
  state: ServerRoomState;
  revision: number;
  lastEventId: number;
}

export interface ServerStreamEvent {
  id: number;
  type: string;
  source?: 'server';
  revision?: number;
  patch?: {
    furniture?: Partial<Record<FurnitureId, ServerRoomState['furniture'][FurnitureId] | null>>;
    objectives?: Objective[];
  };
  state?: ServerRoomState;
  command?: ServerCommand;
  error?: { code: string; message: string };
}

export interface CommandResult {
  accepted: boolean;
  revision: number;
  commandId: number;
  events: ServerStreamEvent[];
  state?: ServerRoomState;
  error?: { code: string; message: string };
}

export interface EventHistoryResponse {
  events: ServerStreamEvent[];
  lastEventId: number;
}

interface EventResponse {
  event: ServerEvent;
}

interface CommandResultResponse {
  result: CommandResult;
}

export async function sendPlaygroundCommand(command: PlaygroundCommand): Promise<ServerEvent> {
  const response = await postJson<EventResponse>('/api/playground/commands', command);
  return response.event;
}

export async function fetchServerState(): Promise<ServerStateResponse> {
  return getJson<ServerStateResponse>('/api/state');
}

export async function sendServerCommand(command: ServerCommand): Promise<CommandResult> {
  const response = await postJson<CommandResultResponse>('/api/commands', command);
  return response.result;
}

export async function fetchEventHistory(after = 0): Promise<EventHistoryResponse> {
  return getJson<EventHistoryResponse>(`/api/events/history?after=${after}`);
}

export function connectServerEvents(since?: number): EventSource {
  const url = new URL(`${getServerUrl()}/api/events`);

  if (since !== undefined) {
    url.searchParams.set('since', String(since));
  }

  return new EventSource(url.toString());
}

export function parseServerEvent(event: MessageEvent<string>): ServerStreamEvent {
  return JSON.parse(event.data) as ServerStreamEvent;
}

export async function runAgentPlaceholder(message: string): Promise<ServerEvent> {
  const response = await postJson<EventResponse>('/api/agent/runs', { message });
  return response.event;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getServerUrl()}${path}`);
  return readJsonResponse<T>(response);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getServerUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return readJsonResponse<T>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message ?? `Server request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function getServerUrl(): string {
  const serverUrl = import.meta.env.VITE_AGENT_SERVER_URL;

  if (!serverUrl) {
    throw new Error('Agent server URL is not configured');
  }

  return serverUrl.replace(/\/$/, '');
}
