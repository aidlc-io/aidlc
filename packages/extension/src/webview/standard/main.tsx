import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { StandardPicker } from '../components/StandardPicker';
import { useHostState } from '../hooks/useHostState';
import { useThemeBridge } from '../hooks/useThemeBridge';
import type { StandardPickerState } from '../lib/types';
import '../styles.css';

function App() {
  useThemeBridge();
  const state = useHostState<StandardPickerState>();
  return <StandardPicker state={state} />;
}

const root = document.getElementById('app');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
