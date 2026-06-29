import { useState } from 'react';

import { runAgentPlaceholder } from '../api/serverEvents';

export function AiAssistantStub() {
  const [status, setStatus] = useState('Agent placeholder ready');

  async function requestAgentRun() {
    setStatus('Contacting server...');

    try {
      const event = await runAgentPlaceholder('Arrange the current room layout');
      setStatus(event.message);
    } catch (error) {
      const message = error instanceof Error && error.message === 'Agent server URL is not configured'
        ? 'Server bridge not configured'
        : 'Server unavailable';
      setStatus(message);
      console.warn(error);
    }
  }

  return (
    <section className="ai-stub" aria-label="AI layout assistant">
      <h2>Layout Assistant</h2>
      <button type="button" onClick={requestAgentRun}>
        Arrange with AI
      </button>
      <p className="ai-stub__status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
