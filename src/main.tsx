// urlInicial debe ir primero: lee el enlace de invitación antes que Supabase
import './lib/urlInicial';
import 'leaflet/dist/leaflet.css';
import './estilos.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
