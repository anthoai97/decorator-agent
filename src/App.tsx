import { RoomCanvas } from './scene/RoomCanvas';
import { PlaygroundShell } from './ui/PlaygroundShell';

export function App() {
  return (
    <main id="app">
      <RoomCanvas />
      <PlaygroundShell />
    </main>
  );
}
