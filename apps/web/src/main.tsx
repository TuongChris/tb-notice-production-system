import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { createApiClient } from './app/api/client.js';
import { App } from './app/App.js';
import './app/app.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root is missing.');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App api={createApiClient()} />
    </BrowserRouter>
  </StrictMode>,
);
