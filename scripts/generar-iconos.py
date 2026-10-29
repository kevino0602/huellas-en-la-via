"""Genera los íconos de la app (PNG) en public/.
Uso: python3 scripts/generar-iconos.py   (requiere Pillow: pip install pillow)
Diseño: asfalto oscuro, línea central amarilla de la vía y una huella.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ASFALTO = (37, 45, 54)
AMARILLO = (232, 170, 22)
CLARO = (242, 244, 246)
SALIDA = Path(__file__).resolve().parent.parent / "public"


def dibujar(lado: int, margen_seguro: float = 0.0) -> Image.Image:
    escala = 4  # dibuja grande y reduce para suavizar bordes
    s = lado * escala
    img = Image.new("RGB", (s, s), ASFALTO)
    d = ImageDraw.Draw(img)

    # Contenido dentro de la zona segura (los íconos "maskable" se recortan)
    m = int(s * margen_seguro)
    area = s - 2 * m

    def x(v: float) -> int:
        return int(m + v * area)

    # Línea central discontinua de la vía (abajo)
    alto = area * 0.05
    y0 = m + area * 0.80
    for i in range(4):
        inicio = 0.04 + i * 0.26
        d.rounded_rectangle([x(inicio), y0, x(inicio + 0.16), y0 + alto], radius=int(alto / 2), fill=AMARILLO)

    # Huella: almohadilla y cuatro dedos
    d.ellipse([x(0.30), x(0.40) - m + m, x(0.70), x(0.72)], fill=CLARO)
    for cx, cy, r in [(0.22, 0.36, 0.085), (0.38, 0.22, 0.09), (0.62, 0.22, 0.09), (0.78, 0.36, 0.085)]:
        d.ellipse([x(cx - r), x(cy - r * 1.15), x(cx + r), x(cy + r * 1.15)], fill=CLARO)

    return img.resize((lado, lado), Image.LANCZOS)


def main() -> None:
    SALIDA.mkdir(exist_ok=True)
    dibujar(192, 0.12).save(SALIDA / "icono-192.png")
    dibujar(512, 0.12).save(SALIDA / "icono-512.png")
    dibujar(512, 0.22).save(SALIDA / "icono-maskable-512.png")
    dibujar(180, 0.12).save(SALIDA / "apple-touch-icon.png")
    print("Íconos generados en", SALIDA)


if __name__ == "__main__":
    main()
