import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { config } from '../config';

// Captcha opcional de Cloudflare Turnstile. Si no hay VITE_TURNSTILE_SITE_KEY
// el componente no muestra nada y los formularios funcionan sin captcha.

interface Turnstile {
  render: (el: HTMLElement, opciones: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let cargaScript: Promise<void> | null = null;
function cargarTurnstile(): Promise<void> {
  cargaScript ??= new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolver();
    s.onerror = () => rechazar(new Error('No se pudo cargar la verificación de seguridad.'));
    document.head.appendChild(s);
  });
  return cargaScript;
}

export const captchaActivo = Boolean(config.turnstileSiteKey);

export interface CaptchaRef {
  reiniciar: () => void;
}

export const Captcha = forwardRef<CaptchaRef, { alCambiar: (token: string | null) => void }>(function Captcha(
  { alCambiar },
  ref,
) {
  const contenedor = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(alCambiar);
  callback.current = alCambiar;

  useImperativeHandle(ref, () => ({
    reiniciar: () => {
      if (widget.current) window.turnstile?.reset(widget.current);
      callback.current(null);
    },
  }));

  useEffect(() => {
    if (!captchaActivo) return;
    let vivo = true;
    cargarTurnstile()
      .then(() => {
        if (!vivo || !contenedor.current || !window.turnstile) return;
        widget.current = window.turnstile.render(contenedor.current, {
          sitekey: config.turnstileSiteKey,
          language: 'es',
          callback: (t: string) => callback.current(t),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      vivo = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  if (!captchaActivo) return null;
  return <div ref={contenedor} className="captcha" />;
});
