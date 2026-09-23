import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/results.css';
import './styles/responsive.css';
import './styles/report.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
