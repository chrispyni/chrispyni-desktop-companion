#!/usr/bin/env python3
"""Converts small pixel-art PNGs into crisp SVGs (text files) for the GitHub README."""
import sys
from PIL import Image
def conv(src, dst, scale=4, bg=None):
    im = Image.open(src).convert('RGBA'); w, h = im.size; px = im.load(); out = []
    if bg: out.append(f'<rect width="{w}" height="{h}" fill="{bg}"/>')
    for y in range(h):
        x = 0
        while x < w:
            c = px[x, y]
            if c[3] == 0: x += 1; continue
            x2 = x
            while x2 + 1 < w and px[x2 + 1, y] == c: x2 += 1
            op = '' if c[3] == 255 else f' fill-opacity="{c[3]/255:.2f}"'
            out.append(f'<rect x="{x}" y="{y}" width="{x2-x+1}" height="1" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"{op}/>')
            x = x2 + 1
    open(dst, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w*scale}" height="{h*scale}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">' + ''.join(out) + '</svg>')
if __name__ == '__main__':
    conv(*sys.argv[1:3], int(sys.argv[3]) if len(sys.argv) > 3 else 4, sys.argv[4] if len(sys.argv) > 4 else None)
