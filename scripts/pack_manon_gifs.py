"""Produce compact looped GIFs from the permitted non-commercial workout-motion SVG poses.
The original artwork is NOT MIT licensed. See docs/assets/manon-gif-sources.md.
"""
from __future__ import annotations
from pathlib import Path
from io import BytesIO
import sys
import re
import cairosvg
from PIL import Image, ImageSequence

src = Path(sys.argv[1]); dst = Path(sys.argv[2]); dst.mkdir(parents=True,exist_ok=True)
for folder in sorted(src.iterdir()):
    if not folder.is_dir(): continue
    poses=[]
    for file in sorted(folder.glob('*.svg')):
        svg = file.read_text(encoding='utf-8')
        # CairoSVG ne sait pas résoudre CSS var(--figure-ink,#hex). Utiliser
        # les couleurs de repli officielles du projet, sans changer le dessin.
        palette = {
            'paper': '#151718', 'ink': '#e5e4e2',
            'detail': '#cecdca', 'muted': '#969b9e',
        }
        for name, color in palette.items():
            svg = svg.replace(f'var(--figure-{name},{color})', color)
            svg = svg.replace(f'var(--figure-{name})', color)
        if 'var(--figure-' in svg:
            raise RuntimeError(f'Unresolved color in {file}')
        png = cairosvg.svg2png(bytestring=svg.encode('utf-8'), output_width=400, output_height=400)
        img = Image.open(BytesIO(png)).convert('RGBA')
        background=Image.new('RGBA',img.size, '#151718')
        background.alpha_composite(img)
        poses.append(background.convert('RGB'))
    if not poses: raise RuntimeError(f'No frames for {folder.name}')
    # Palette-quantized, >2-MB GIFs are expensive and exceed Workbox precache defaults.
    palettes=[image.quantize(colors=128) for image in poses]
    output=dst/f'{folder.name}.gif'
    palettes[0].save(output,save_all=True,append_images=palettes[1:],
                     duration=95,loop=0,optimize=True,disposal=2)
    with Image.open(output) as gif:
        observed=getattr(gif,'n_frames',1)
        if gif.size != (400,400): raise RuntimeError(f'{output}: wrong dimensions')
        if folder.name != 'gainage-frontal' and observed < 12:
            raise RuntimeError(f'{output}: expected movement, got {observed} frames')
    if output.stat().st_size > 1_900_000: raise RuntimeError(f'{output}: too heavy')
    print(output, output.stat().st_size, 'bytes',observed,'frames')
