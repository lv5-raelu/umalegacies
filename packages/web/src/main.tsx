import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { App } from './App';
import { adoptLegacyHash } from './route';
import './styles/tokens.css';

adoptLegacyHash();

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>,
);
