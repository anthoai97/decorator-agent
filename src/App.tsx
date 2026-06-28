import { PlaygroundShell } from './ui/PlaygroundShell';

export function App() {
  return (
    <main id="app">
      <div id="viewport" />
      <PlaygroundShell />
      <div id="webgpu-message" className="webgpu-message" role="status" hidden />
    </main>
  );
}
