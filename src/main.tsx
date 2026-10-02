import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './style.css';
import './refresh.css';
import './homeTour.css';
import './landing.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
