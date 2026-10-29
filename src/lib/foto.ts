import { config } from '../config';

/**
 * Toma el cuadro actual de la cámara y lo guarda como JPEG reducido.
 *
 * Privacidad: al dibujar en un <canvas> y volver a codificar, la imagen
 * resultante NO lleva metadatos EXIF (ubicación de la casa, modelo del
 * celular, fecha interna). La ubicación del reporte se guarda aparte, solo
 * la del lugar donde está el animal.
 */
export async function capturarCuadro(video: HTMLVideoElement): Promise<Blob> {
  const ancho = video.videoWidth;
  const alto = video.videoHeight;
  if (!ancho || !alto) throw new Error('La cámara todavía no está lista.');

  const escala = Math.min(1, config.foto.ladoMaximoPx / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la foto.');
  ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);

  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo guardar la foto.'))),
      'image/jpeg',
      config.foto.calidadJpeg,
    );
  });
}
