import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { App } from './App';
import './styles/tokens.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>,
);
