export function App() {
  return (
    <main id="app">
      <div id="viewport" />
      <section className="hud" aria-label="Room controls">
        <div className="brand">
          <span className="brand__mark" />
          <span>Room Composer</span>
        </div>
        <div className="status" aria-live="polite">
          <span id="selected-name">React migration ready</span>
          <span id="selected-position" />
          <span id="layout-status" />
        </div>
      </section>
      <div id="webgpu-message" className="webgpu-message" role="status" hidden />
    </main>
  );
}
