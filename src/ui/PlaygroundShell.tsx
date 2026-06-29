import { AiAssistantStub } from './AiAssistantStub';
import { InspectorPanel } from './InspectorPanel';
import { Toolbar } from './Toolbar';

export function PlaygroundShell() {
  return (
    <>
      <Toolbar />
      <div className="side-panel">
        <InspectorPanel />
        <AiAssistantStub />
      </div>
    </>
  );
}
