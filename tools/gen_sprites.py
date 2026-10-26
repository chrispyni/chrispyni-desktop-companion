#!/usr/bin/env python3
"""Generates all built-in pixel art for Project Wives (characters, props, effects, rooms,
templates, previews). Pure PIL, drawn pixel-by-pixel so it stays crisp. Re-run after edits:
    python3 tools/gen_sprites.py
Hand-drawn PNGs dropped into content/ or mods/ always win over these (just overwrite the file)."""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = lambda *p: os.path.join(ROOT, *p)
FW, FH = 48, 64           # character frame size
FEET = (24, 62)           # anchor (feet) inside a frame
ROWS = [("idle", 4, 4), ("walk", 6, 8), ("run", 6, 12), ("talk", 4, 6), ("sit", 4, 3), ("lay", 4, 2),
        ("sleep", 4, 2), ("happy", 4, 8), ("pout", 4, 4), ("cast", 6, 10), ("wave", 4, 6), ("hug", 4, 4), ("kiss", 4, 4),
        ("fall", 4, 10), ("float", 4, 4), ("superhero_land", 4, 6), ("faceplant", 4, 4), ("getup", 4, 5), ("watch", 4, 2)]  # name, frames, fps

def hx(s, a=255):
    s = s.lstrip('#'); return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)

# ---- character designs (taken from her keepsake plush trio / portraits, see README "Sources") ----
CHARS = {
 "nixie": dict(name="Nixie", full="Nixaria", title="Last Light", height=44,
     skin="f3d2c0", skin_sh="dcae9a", hair="e4e4e8", hair_sh="b4b4bc", streak=None, hair_len=22,
     eye="3fa34a", pupil="1d5a25", outfit="f4ecdc", outfit_sh="d8cdb4", trim="d4a537", gem="2e9e4a",
     acc="circlet", ahoge=True, blush=True, legwear="f4ecdc", magic="fff2b0"),
 "noct": dict(name="Noct", full="Noctaris", title="Unmaking", height=56,
     skin="efcfc0", skin_sh="d2ab9c", hair="15121c", hair_sh="0a0810", streak="8a3fd1", hair_len=30,
     eye="8e5ad8", pupil="3a1a66", outfit="141018", outfit_sh="000000", trim="8a3fd1", gem="b27cff",
     acc="choker", ahoge=True, blush=False, legwear="1a1420", magic="9b4dff"),
 "chrispyni": dict(name="ChrispyNi", full="ChrispyNi", title="God of Death", height=50,
     skin="6b4330", skin_sh="4e2f21", hair="231a33", hair_sh="140e20", streak="d4a537", hair_len=26,
     eye="8e5ad8", pupil="d0202a", outfit="121016", outfit_sh="000000", trim="d4a537", gem="d4a537",
     acc="crown", ahoge=True, blush=False, legwear="121016", magic="f2c84b"),
}

def px(d, x, y, c):
    d.point((int(x), int(y)), fill=c)

def rect(d, x0, y0, x1, y1, c):
    d.rectangle([int(x0), int(y0), int(x1), int(y1)], fill=c)

def ell(d, x0, y0, x1, y1, c):
    d.ellipse([int(x0), int(y0), int(x1), int(y1)], fill=c)

def draw_char(img, ox, oy, P, pose, f, nf):
    d = ImageDraw.Draw(img)
    skin, skin_sh = hx(P["skin"]), hx(P["skin_sh"])
    hair, hair_sh = hx(P["hair"]), hx(P["hair_sh"])
    streak = hx(P["streak"]) if P["streak"] else None
    out, out_sh, trim = hx(P["outfit"]), hx(P["outfit_sh"]), hx(P["trim"])
    eye, pupil, gem, leg = hx(P["eye"]), hx(P["pupil"]), hx(P["gem"]), hx(P["legwear"])
    magic = hx(P["magic"])
    outline = (20, 12, 24, 255)
    fx, fy = ox + FEET[0], oy + FEET[1]
    H = P["height"]
    ph = f / max(1, nf) * 2 * math.pi
    bob = 0; lean = 0; sit = pose in ("sit", "sleep"); eyes = "open"; mouth = "smile"
    arms = "down"; legsw = 0
    if pose == "idle": bob = 1 if f in (1, 2) else 0; eyes = "closed" if f == 3 else "open"
    if pose == "walk": bob = int(abs(math.sin(ph)) * 2); legsw = int(round(math.sin(ph) * 2))  # moderate stride
    if pose == "talk": mouth = "open" if f % 2 == 0 else "smile"; bob = f % 2
    if pose == "sit": bob = 0; eyes = "closed" if f == 3 else "open"
    if pose == "sleep": eyes = "closed"; mouth = "flat"; bob = 1 if f >= 2 else 0
    if pose == "happy": bob = [0, 3, 4, 2][f % 4]; eyes = "happy"; mouth = "open"; arms = "up"
    if pose == "pout": mouth = "pout"; arms = "crossed"; eyes = "half"; bob = f % 2
    if pose == "run": bob = int(abs(math.sin(ph)) * 3); legsw = int(round(math.sin(ph) * 5)); mouth = "open" if f % 3 == 0 else "smile"
    if pose == "wave": arms = "wave"; mouth = "open" if f % 2 else "smile"; bob = f % 2
    if pose == "hug": arms = "forward"; eyes = "happy"; mouth = "smile"; bob = 1 if f in (1, 2) else 0
    if pose == "kiss": arms = "forward"; eyes = "closed"; mouth = "pout"; lean = 2 if f in (1, 2) else 1
    if pose == "lay": eyes = "closed" if f >= 2 else "open"; mouth = "smile"
    if pose == "cast": arms = "cast"; eyes = "open" if f < 4 else "glow"; mouth = "flat"; bob = 1 if f in (2, 3) else 0
    if pose == "fall": arms = "up"; legsw = 3 if f % 2 else -3; mouth = "open"; eyes = "open"
    if pose == "float": arms = "down"; eyes = "half"; mouth = "flat"; bob = f % 2; legsw = 1
    if pose == "kneel": sit = True; arms = "fist"; eyes = "open"; mouth = "flat"
    if pose == "splat": arms = "up"; eyes = "closed"; mouth = "open"
    sitdrop = 10 if sit else 0
    top = fy - H + sitdrop - bob          # head top
    r = 9                                   # head radius (chibi)
    hcx, hcy = fx + lean, top + r + 1
    if pose == "sleep": hcx += 2; hcy += 2
    neck = hcy + r
    legs_len = 12 if not sit else 4
    torso_b = fy - legs_len + (0 if not sit else -2) - bob * 0
    if sit: torso_b = fy - 5
    # --- back hair (long) ---
    hl = P["hair_len"]
    hb = min(fy - 2, hcy + hl) - (sitdrop // 2 if sit else 0)
    rect(d, hcx - r - 1, hcy - 2, hcx + r + 1, hb - 3, hair_sh)
    ell(d, hcx - r - 1, hb - 8, hcx + r + 1, hb, hair_sh)
    if streak:
        for sx in (hcx - r + 1, hcx + r - 2):
            rect(d, sx, hcy + 2, sx, hb - 2, streak)
    # --- legs ---
    if not sit:
        for side, sw in ((-1, legsw), (1, -legsw)):
            lx = fx + side * 3
            rect(d, lx - 2 + sw, torso_b, lx + 1 + sw, fy - 1, leg)
            rect(d, lx - 2 + sw, fy - 1, lx + 2 + sw, fy, outline)  # shoes
            rect(d, lx - 2 + sw, fy - 5, lx + 1 + sw, fy - 5, trim)
    else:
        rect(d, fx - 7, fy - 4, fx + 8, fy - 1, leg)
        rect(d, fx + 6, fy - 2, fx + 9, fy, outline)
        rect(d, fx - 7, fy - 4, fx + 8, fy - 4, trim)
    # --- torso / dress ---
    tw = 6 if P["height"] < 50 else 6
    rect(d, fx - tw, neck + 1, fx + tw - 1, torso_b, out)
    rect(d, fx - tw - 1, torso_b - 4, fx + tw, torso_b, out)        # skirt flare
    rect(d, fx - tw - 1, torso_b, fx + tw, torso_b, out_sh)
    rect(d, fx - 2, neck + 1, fx + 1, neck + 3, skin)                # neckline
    rect(d, fx - tw, neck + 6, fx + tw - 1, neck + 6, trim)          # belt
    px(d, fx, neck + 6, gem); px(d, fx - 1, neck + 6, gem)
    if P["acc"] == "crown":  # gold star on chest like her plush
        for (a, b) in ((0, 3), (-1, 4), (1, 4), (0, 5), (0, 4)):
            px(d, fx + a - (1 if a == 0 else 0) + (1 if a == 0 else 0), neck + b, trim)
    if P["acc"] == "choker":
        rect(d, fx - 2, neck, fx + 1, neck, trim); px(d, fx, neck + 1, gem)
    if P["acc"] == "circlet":
        px(d, fx - 1, neck + 3, gem); px(d, fx, neck + 3, gem)
    # --- arms ---
    sh_y = neck + 2
    def arm(side, mode):
        x = fx + side * (tw + 1) - (1 if side < 0 else 0)
        if mode == "down":
            sw = -legsw if side < 0 else legsw
            rect(d, x, sh_y, x + 1, sh_y + 8, out_sh if P["outfit"] < "8" else out)
            rect(d, x + (sw > 0), sh_y + 8, x + 1 + (sw > 0), sh_y + 9, skin)
        elif mode == "up":
            rect(d, x, sh_y - 7, x + 1, sh_y, out)
            rect(d, x, sh_y - 9, x + 1, sh_y - 8, skin)
        elif mode == "crossed":
            rect(d, fx - tw, sh_y + 3, fx + tw - 1, sh_y + 4, out_sh)
            rect(d, fx - 2, sh_y + 3, fx + 1, sh_y + 4, skin)
        elif mode == "wave":
            if side > 0:
                up = f % 2
                rect(d, x, sh_y - 6, x + 1, sh_y, out); rect(d, x + up, sh_y - 9, x + 1 + up, sh_y - 7, skin)
            else:
                arm(side, "down")
        elif mode == "fist":
            if side > 0:
                rect(d, x, sh_y, x + 1, fy - 3, out); rect(d, x - 1, fy - 3, x + 2, fy - 1, skin)
            else:
                arm(side, "down")
        elif mode == "forward":
            yy = sh_y + 3 + (1 if side < 0 else 0)
            rect(d, fx, yy, fx + tw + 5, yy + 1, out_sh if side < 0 else out); rect(d, fx + tw + 6, yy, fx + tw + 7, yy + 1, skin)
        elif mode == "cast":
            if side > 0:
                rect(d, x, sh_y - 1, x + 6, sh_y, out)
                rect(d, x + 7, sh_y - 1, x + 8, sh_y, skin)
                rr = [1, 2, 3, 4, 3, 2][f % 6]
                cx, cy = x + 10, sh_y - 1
                ell(d, cx - rr, cy - rr, cx + rr, cy + rr, magic[:3] + (170,))
                px(d, cx, cy, (255, 255, 255, 255))
                for k in range(3):
                    a = ph + k * 2.1
                    px(d, cx + math.cos(a) * (rr + 3), cy + math.sin(a) * (rr + 3), magic)
            else:
                arm(side, "down")
    if arms == "crossed":
        arm(-1, "down"); arm(1, "down"); arm(0, "crossed")
    else:
        arm(-1, "down" if arms in ("cast", "fist") else arms); arm(1, arms)
    # --- head ---
    ell(d, hcx - r, hcy - r, hcx + r, hcy + r, skin)
    rect(d, hcx - r + 2, hcy + r - 2, hcx + r - 2, hcy + r - 1, skin_sh)
    # elf ears (long, pointed, sideways - NOT horns)
    for side in (-1, 1):
        ex = hcx + side * (r - 1)
        for i in range(8):
            yy = hcy + 3 - (1 if i >= 4 else 0) - (1 if i >= 7 else 0)
            px(d, ex + side * i, yy, skin)
            if i < 6: px(d, ex + side * i, yy + 1, skin_sh)
    # fringe / bangs
    ell(d, hcx - r - 1, hcy - r - 1, hcx + r + 1, hcy + 3, hair)
    rect(d, hcx - r + 2, hcy - 1, hcx + r - 2, hcy + 3, skin)          # forehead window
    for bx in range(-r + 2, r - 1, 3):   # jagged bang tips
        px(d, hcx + bx, hcy - 1, hair); px(d, hcx + bx, hcy, hair); px(d, hcx + bx + 1, hcy - 1, hair)
    rect(d, hcx - r - 1, hcy - 3, hcx - r + 1, hcy + 8, hair)           # side locks
    rect(d, hcx + r - 1, hcy - 3, hcx + r + 1, hcy + 8, hair)
    if streak:
        for sx in (-5, 3):
            rect(d, hcx + sx, hcy - r, hcx + sx, hcy - 2, streak)
        px(d, hcx - r, hcy + 4, streak); px(d, hcx + r, hcy + 5, streak)
    if P["ahoge"]:
        px(d, hcx + 1, hcy - r - 2, hair); px(d, hcx + 2, hcy - r - 3, hair); px(d, hcx + 3, hcy - r - 3, hair)
    # eyes
    ey = hcy + 4
    for side in (-1, 1):
        exx = hcx + side * 4 - (1 if side < 0 else 0)
        if eyes in ("open", "glow"):
            rect(d, exx, ey - 1, exx + 1, ey + 1, eye)
            px(d, exx + (1 if side < 0 else 0), ey, pupil if eyes != "glow" else magic)
            px(d, exx, ey - 1, (255, 255, 255, 255))
            rect(d, exx - 1, ey - 2, exx + 2, ey - 2, outline)
        elif eyes == "half":
            rect(d, exx - 1, ey - 1, exx + 2, ey - 1, outline); rect(d, exx, ey, exx + 1, ey, eye)
        elif eyes == "happy":
            px(d, exx - 1, ey + 1, outline); px(d, exx, ey, outline); px(d, exx + 1, ey, outline); px(d, exx + 2, ey + 1, outline)
        else:
            rect(d, exx - 1, ey + 1, exx + 2, ey + 1, outline)
    if P["blush"] or pose in ("happy", "pout"):
        px(d, hcx - 6, ey + 3, (240, 120, 140, 200)); px(d, hcx + 5, ey + 3, (240, 120, 140, 200))
    my = hcy + 7
    if mouth == "smile": px(d, hcx - 1, my, outline); px(d, hcx, my, outline)
    elif mouth == "open": rect(d, hcx - 1, my, hcx, my + 1, (120, 30, 40, 255))
    elif mouth == "pout": px(d, hcx - 1, my, outline); px(d, hcx, my - 1, outline); px(d, hcx + 1, my, outline)
    else: rect(d, hcx - 1, my, hcx, my, outline)
    # accessories
    if P["acc"] == "circlet":
        rect(d, hcx - r + 1, hcy - r + 3, hcx + r - 1, hcy - r + 3, trim)
        for gx in (-5, 0, 5):
            px(d, hcx + gx, hcy - r + 2, trim); px(d, hcx + gx, hcy - r + 3, gem)
        px(d, hcx, hcy - r + 1, gem)
    if P["acc"] == "crown":   # floating gold spiked crown, hovers & bobs separately
        fl = 3 + (1 if (f // 2) % 2 else 0)
        cy = hcy - r - fl
        rect(d, hcx - 8, cy, hcx + 8, cy + 1, trim)
        for sx, hgt in ((-8, 7), (-4, 4), (0, 8), (4, 4), (8, 7)):
            for k in range(hgt):
                px(d, hcx + sx, cy - k, trim)
            px(d, hcx + sx, cy - hgt, (255, 236, 150, 255))
        px(d, hcx, cy + 1, (255, 236, 150, 120))
    if pose == "sleep":
        zx, zy = hcx + 9, hcy - r - 2 - (f % 4)
        for (a, b) in ((0, 0), (1, 0), (2, 0), (1, 1), (0, 2), (1, 2), (2, 2)):
            px(d, zx + a, zy + b, (220, 220, 255, 220))
    if pose in ("kiss", "hug") and f in (1, 2):
        for (dx, dy) in ((0, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1), (0, 2), (1, 2), (2, 2), (1, 3)):
            px(d, hcx + 9 + dx, hcy - r - 4 + dy - f, (255, 90, 150, 255))
    if pose == "happy" and f % 2:
        for (a, b) in ((-12, -2), (12, 0)):
            px(d, hcx + a, hcy + b, (255, 120, 170, 255)); px(d, hcx + a + 1, hcy + b, (255, 120, 170, 255))
            px(d, hcx + a, hcy + b + 1, (255, 120, 170, 255))

def draw_lay(sheet, ox, oy, P, f, nf):
    """Lying down (on a bed/floor): upright head on a pillow at the left, body under a blanket."""
    tmp = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    draw_char(tmp, 0, 0, P, "lay", f, nf)
    top = FEET[1] - P["height"]
    head = tmp.crop((6, max(0, top - 10), 42, top + 20))
    d = ImageDraw.Draw(sheet)
    breath = 1 if f % 2 else 0
    rect(d, ox + 1, oy + FH - 8, ox + 20, oy + FH - 3, hx("e8e0f0"))            # pillow
    sheet.alpha_composite(head, (ox - 6, oy + FH - 6 - head.height + 2))
    rect(d, ox + 22, oy + FH - 15 - breath, ox + FW - 1, oy + FH - 2, hx("6a2fa8"))  # blanket lump
    rect(d, ox + 22, oy + FH - 15 - breath, ox + FW - 1, oy + FH - 14 - breath, hx("d4a537"))

def _pose(P, pose, f, nf):
    t = Image.new("RGBA", (FW, FH), (0, 0, 0, 0)); draw_char(t, 0, 0, P, pose, f, nf); return t

def _place_rot(sheet, ox, oy, tmp, angle, dy=0):
    """Rotate a frame around the feet and lay it on the ground of the cell (fits the 48px width)."""
    r = tmp.rotate(angle, resample=Image.NEAREST, expand=True)
    bb = r.getbbox()
    if not bb: return
    r = r.crop(bb)
    if r.width > FW - 2:
        k = (FW - 2) / r.width; r = r.resize((FW - 2, max(1, int(r.height * k))), Image.NEAREST)
    x = ox + (FW - r.width) // 2; y = oy + FEET[1] + 1 - r.height + dy
    sheet.alpha_composite(r, (x, max(oy, y)))

def _stars(sheet, ox, oy, f, cy):
    d = ImageDraw.Draw(sheet)
    for k in range(3):
        a = f * 1.2 + k * 2.1
        x = ox + 24 + math.cos(a) * 10; y = oy + cy + math.sin(a) * 3
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)): px(d, x + dx, y + dy, (255, 224, 102, 255))

def draw_special(sheet, ox, oy, P, name, f, nf):
    if name == "superhero_land":
        if f == 0:
            t = _pose(P, "fall", 0, 4); bb = t.getbbox()
            sq = t.crop(bb).resize((bb[2] - bb[0] + 2, int((bb[3] - bb[1]) * 0.8)), Image.NEAREST)
            sheet.alpha_composite(sq, (ox + bb[0] - 1, oy + FEET[1] + 1 - sq.height))
        elif f < 3: sheet.alpha_composite(_pose(P, "kneel", f, nf), (ox, oy))
        else: sheet.alpha_composite(_pose(P, "idle", 0, 4), (ox, oy))
        return True
    if name == "faceplant":
        t = _pose(P, "splat", f, nf)
        if f == 0: _place_rot(sheet, ox, oy, t, -60)
        else: _place_rot(sheet, ox, oy, t, -90, dy=-1 if f == 2 else 0); _stars(sheet, ox, oy, f, FEET[1] - 26)
        return True
    if name == "watch":   # sitting with her BACK to us, watching the screen
        t = _pose(P, "sit", 0, 4); d2 = ImageDraw.Draw(t)
        H = P["height"]; hcx = FEET[0]; hcy = FEET[1] - H + 10 + 10 + (1 if f in (1, 2) else 0) - 0
        hair, hair_sh = hx(P["hair"]), hx(P["hair_sh"])
        ell(d2, hcx - 9, hcy - 10, hcx + 9, hcy + 8, hair); rect(d2, hcx - 9, hcy, hcx + 9, hcy + P["hair_len"] // 2, hair)
        rect(d2, hcx - 1, hcy - 9, hcx, hcy + 6, hair_sh)
        if P["streak"]: rect(d2, hcx + 4, hcy - 6, hcx + 4, hcy + 8, hx(P["streak"]))
        for side in (-1, 1):
            for i in range(6): px(d2, hcx + side * (9 + i), hcy - i // 2, hx(P["skin"]))
        sheet.alpha_composite(t, (ox, oy)); return True
    if name == "getup":
        if f == 0: _place_rot(sheet, ox, oy, _pose(P, "splat", 1, 4), -90); _stars(sheet, ox, oy, f, FEET[1] - 26)
        elif f == 1: _place_rot(sheet, ox, oy, _pose(P, "kneel", 1, 4), -40)
        elif f == 2: sheet.alpha_composite(_pose(P, "kneel", 2, 4), (ox, oy))
        else: sheet.alpha_composite(_pose(P, "idle", 0, 4), (ox, oy))
        return True
    return False

def outline_sheet(im, col=(18, 10, 22, 255)):
    src = im.load(); out = im.copy(); o = out.load()
    for y in range(im.height):
        for x in range(im.width):
            if src[x, y][3] == 0:
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < im.width and 0 <= Y < im.height and src[X, Y][3] > 160 and (X // FW == x // FW) and (Y // FH == y // FH):
                        o[x, y] = col; break
    return out

def build_character(cid, P):
    maxf = max(r[1] for r in ROWS)
    sheet = Image.new("RGBA", (FW * maxf, FH * len(ROWS)), (0, 0, 0, 0))
    for ri, (name, n, fps) in enumerate(ROWS):
        for f in range(n):
            if name == "lay": draw_lay(sheet, f * FW, ri * FH, P, f, n)
            elif draw_special(sheet, f * FW, ri * FH, P, name, f, n): pass
            else: draw_char(sheet, f * FW, ri * FH, P, name, f, n)
    out = C("content", "characters", cid); os.makedirs(out, exist_ok=True)
    sheet = outline_sheet(sheet)
    sheet.save(os.path.join(out, "sheet.png"))
    return sheet

# ---------------- props ----------------
def prop_img(w, h, fn, frames=1):
    im = Image.new("RGBA", (w * frames, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for f in range(frames): fn(d, f * w, f)
    return im

GOLD, GOLDL, VOID, VOIDL, WOOD, WOODD = hx("d4a537"), hx("ffe08a"), hx("2a1240"), hx("8a3fd1"), hx("6b3f2a"), hx("40241a")
def p_chair(d, o, f):
    rect(d, o+8, 4, o+23, 6, VOID); rect(d, o+8, 4, o+9, 20, WOODD); rect(d, o+22, 4, o+23, 20, WOODD)
    rect(d, o+8, 7, o+23, 18, VOIDL); rect(d, o+6, 18, o+25, 22, VOID); rect(d, o+6, 18, o+25, 18, GOLD)
    for x in (o+7, o+24): rect(d, x, 23, x, 31, WOODD)
def p_teacup(d, o, f):
    rect(d, o+8, 18, o+20, 26, hx("f4ecdc")); rect(d, o+8, 18, o+20, 18, GOLD); rect(d, o+21, 20, o+23, 24, hx("f4ecdc"))
    rect(d, o+6, 27, o+23, 28, hx("e0d6c4")); rect(d, o+9, 19, o+19, 20, hx("8a4a2a"))
    for k in range(3): px(d, o+11+k*3, 15-((f+k)%3)*2, (255, 255, 255, 150))
def p_bed(d, o, f):
    rect(d, o+2, 6, o+5, 30, WOODD); rect(d, o+2, 4, o+5, 5, GOLD)
    rect(d, o+4, 18, o+61, 25, hx("3a2050")); rect(d, o+6, 14, o+18, 19, hx("e8e0f0"))
    rect(d, o+18, 15, o+61, 23, VOIDL); rect(d, o+18, 15, o+61, 15, GOLD); rect(d, o+4, 26, o+61, 27, WOOD)
    for x in (o+4, o+60): rect(d, x, 28, x+1, 31, WOODD)
def p_cushion(d, o, f):
    ell(d, o+4, 18, o+27, 29, VOIDL); ell(d, o+6, 19, o+25, 26, hx("a964e8")); px(d, o+15, 23, GOLD)
    for x in (o+4, o+27): px(d, x, 18, GOLD)
def p_books(d, o, f):
    cols = [hx("7a1f2a"), hx("1f4a7a"), hx("2e6a3a"), VOIDL]
    for i, c in enumerate(cols): rect(d, o+6, 28-i*5, o+25-i*2, 31-i*5, c); rect(d, o+6, 28-i*5, o+6, 31-i*5, GOLD)
def p_candles(d, o, f):
    for i, (x, h) in enumerate(((8, 10), (15, 14), (22, 8))):
        rect(d, o+x, 30-h, o+x+3, 30, hx("efe6d2")); rect(d, o+x, 30-h, o+x+3, 30-h, hx("d8ccb4"))
        fl = (f + i) % 3
        rect(d, o+x+1, 27-h-fl, o+x+2, 29-h, hx("ffb030")); px(d, o+x+1, 28-h, hx("fff4b0"))
        ell(d, o+x-2, 24-h-fl, o+x+5, 31-h, (255, 190, 80, 40))
    rect(d, o+5, 30, o+27, 31, GOLD)
def p_void_portal(d, o, f):
    for k in range(6, 0, -1):
        a = (k * 40 + f * 30) % 255
        c = (40 + k*15, 10, 60 + k*25, 255 if k > 1 else 255)
        ell(d, o+16-k*2-2, 16-k*2-4, o+16+k*2+2, 16+k*2+4, c)
    ell(d, o+13, 11, o+19, 21, (0, 0, 0, 255))
    for k in range(4):
        a = f * 0.8 + k * 1.57
        px(d, o+16+math.cos(a)*12, 16+math.sin(a)*14, hx("c59bff"))
def p_light_orb(d, o, f):
    rr = [5, 6, 7, 6][f % 4]
    ell(d, o+16-rr-4, 16-rr-4, o+16+rr+4, 16+rr+4, (255, 240, 170, 50))
    ell(d, o+16-rr, 16-rr, o+16+rr, 16+rr, (255, 242, 176, 200)); ell(d, o+14, 14, o+18, 18, (255, 255, 255, 255))
def p_sofa(d, o, f):
    rect(d, o+4, 8, o+59, 18, hx("4a1f5a")); rect(d, o+4, 8, o+59, 8, GOLD)
    rect(d, o+2, 16, o+61, 25, hx("5e2a72")); rect(d, o+2, 12, o+7, 25, hx("4a1f5a")); rect(d, o+56, 12, o+61, 25, hx("4a1f5a"))
    rect(d, o+10, 17, o+31, 20, hx("7a3a92")); rect(d, o+33, 17, o+53, 20, hx("7a3a92"))
    for x in (o+4, o+58): rect(d, x, 26, x+1, 31, GOLD)
def p_table(d, o, f):
    rect(d, o+2, 14, o+29, 16, WOOD); rect(d, o+2, 14, o+29, 14, GOLD)
    for x in (o+4, o+26): rect(d, x, 17, x+1, 31, WOODD)
    rect(d, o+6, 17, o+25, 18, hx("4a1f5a"))
def p_charm(d, o, f):
    c = [hx("fff2b0"), hx("ffe08a"), hx("fff2b0")][f % 3]
    ell(d, o+10, 10, o+22, 22, (178, 124, 255, 90)); rect(d, o+15, 8, o+16, 24, c); rect(d, o+8, 15, o+24, 16, c)
    ell(d, o+13, 13, o+18, 18, hx("9b4dff")); px(d, o+15, 15, (255, 255, 255, 255)); rect(d, o+15, 24, o+16, 31, GOLD)
def p_flower(d, o, f):
    rect(d, o+15, 18, o+16, 31, hx("2e9e4a")); rect(d, o+17, 24, o+19, 25, hx("2e9e4a"))
    for a in range(5):
        x = o + 15.5 + math.cos(a * 1.257 + f * 0.1) * 4; y = 13 + math.sin(a * 1.257 + f * 0.1) * 4
        ell(d, x - 2, y - 2, x + 2, y + 2, hx("ff9ad0"))
    ell(d, o+14, 12, o+17, 15, hx("ffe08a"))
def p_door(d, o, f):
    # arched wooden door to Chrispy's room, soft purple light at the seams
    rect(d, o+6, 14, o+41, 63, WOODD); ell(d, o+6, 0, o+41, 30, WOODD)
    rect(d, o+9, 16, o+38, 61, WOOD); ell(d, o+9, 3, o+38, 30, WOOD)
    for x in (o+16, o+23, o+31): rect(d, x, 12, x, 61, WOODD)
    d.arc([o+6, 0, o+41, 30], 180, 360, fill=GOLD); rect(d, o+6, 15, o+6, 63, GOLD); rect(d, o+41, 15, o+41, 63, GOLD)
    glow = (178, 124, 255, [120, 170, 220, 170][f % 4])
    rect(d, o+8, 62, o+39, 63, glow); rect(d, o+33, 38, o+35, 40, GOLDL)
    for k in range(3): px(d, o+12 + k * 11, 8 + (f + k) % 3, (255, 224, 138, 200))
PROPS = {  # id: (w,h,frames,fps,fn,cost,label)
 "chair": (32, 32, 1, 1, p_chair, 10, "Void Throne Chair"), "teacup": (32, 32, 3, 4, p_teacup, 3, "Teacup"),
 "bed": (64, 32, 1, 1, p_bed, 25, "Royal Bed"), "cushion": (32, 32, 1, 1, p_cushion, 5, "Cushion"),
 "books": (32, 32, 1, 1, p_books, 4, "Stack of Books"), "candles": (32, 32, 3, 6, p_candles, 4, "Candles"),
 "sofa": (64, 32, 1, 1, p_sofa, 15, "Velvet Sofa"), "table": (32, 32, 1, 1, p_table, 8, "Little Table"),
 "crafted_charm": (32, 32, 3, 4, p_charm, 0, "Light & Void Charm (crafted)"), "flower": (32, 32, 2, 2, p_flower, 0, "Magic Flower (gift)"),
 "void_portal": (32, 32, 8, 8, p_void_portal, 20, "Void Portal"), "door": (48, 64, 4, 4, p_door, 5, "Door to Chrispy's Room"), "light_orb": (32, 32, 4, 6, p_light_orb, 6, "Light Orb"),
}

# ---------------- effects ----------------
def fx_sheet(color, kind, n=6, S=32):
    im = Image.new("RGBA", (S * n, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    rnd = random.Random(kind)
    pts = [(rnd.uniform(0, 6.28), rnd.uniform(0.5, 1)) for _ in range(10)]
    for f in range(n):
        o = f * S; t = (f + 1) / n
        if kind == "hearts":
            for i, (a, s) in enumerate(pts[:5]):
                x = o + 16 + math.cos(a) * 8; y = 26 - t * 22 * s
                for (dx, dy) in ((0, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1), (0, 2), (1, 2), (2, 2), (1, 3)):
                    px(d, x + dx, y + dy, color[:3] + (int(255 * (1 - t * 0.7)),))
            continue
        rr = int(2 + t * 13)
        if kind in ("burst", "void"):
            d.ellipse([o+16-rr, 16-rr, o+16+rr, 16+rr], outline=color[:3] + (int(255 * (1 - t)),))
        for a, s in pts:
            x = o + 16 + math.cos(a) * rr * s; y = 16 + math.sin(a) * rr * s
            px(d, x, y, color); 
            if f < n - 1: px(d, x + 1, y, (255, 255, 255, 200))
        if f < 2: ell(d, o+14, 14, o+18, 18, (255, 255, 255, 220))
    return im
EFFECTS = {"spawn_sparkle": (hx("ffe08a"), "sparkle", 6, 12, "Gold sparkle (generic spawn)"),
           "void_burst": (hx("9b4dff"), "void", 6, 12, "Void burst (Noct)"),
           "light_burst": (hx("fff2b0"), "burst", 6, 12, "Last Light burst (Nixie)"),
           "hearts": (hx("ff6fa8"), "hearts", 6, 8, "Floating hearts"),
           "death_mist": (hx("7fe0b0"), "sparkle", 6, 10, "Death mist (ChrispyNi)"),
           "dizzy_stars": (hx("ffe066"), "sparkle", 6, 8, "Dizzy stars (faceplant)"),
           "levitate_aura": (hx("b27cff"), "void", 6, 8, "Levitation aura"),
           "gift_flower": (hx("ff9ad0"), "hearts", 6, 8, "Lovely gift sparkles")}

# ---------------- room ----------------
def build_room():
    W, H = 320, 180
    im = Image.new("RGBA", (W, H), hx("1a1022")); d = ImageDraw.Draw(im)
    rect(d, 0, 0, W, 120, hx("231530"))
    for x in range(0, W, 16): rect(d, x, 0, x, 120, hx("2a1a3a"))
    rect(d, 0, 120, W, H, hx("2e1c24"))
    for y in range(124, H, 8): rect(d, 0, y, W, y, hx("261620"))
    # window with moon & stars
    rect(d, 24, 20, 84, 84, hx("0c0818")); rect(d, 22, 18, 86, 19, GOLD); rect(d, 22, 85, 86, 86, GOLD)
    rect(d, 53, 20, 55, 84, hx("3a2448")); rect(d, 24, 50, 84, 52, hx("3a2448"))
    ell(d, 62, 26, 76, 40, hx("f4ecdc")); ell(d, 66, 26, 80, 38, hx("0c0818"))
    rnd = random.Random(3)
    for _ in range(18): px(d, rnd.randint(26, 82), rnd.randint(22, 82), (255, 255, 220, rnd.randint(120, 255)))
    # curtains
    rect(d, 12, 14, 24, 96, hx("4a1f5a")); rect(d, 84, 14, 96, 96, hx("4a1f5a")); rect(d, 8, 12, 100, 14, GOLD)
    # shelf w books & candles
    rect(d, 230, 60, 300, 62, WOOD)
    for i, c in enumerate(("7a1f2a", "1f4a7a", "2e6a3a", "8a3fd1", "d4a537")): rect(d, 234 + i*6, 46, 238 + i*6, 59, hx(c))
    # big bed (centre)
    bx, by = 110, 92
    rect(d, bx, by - 30, bx + 4, by + 40, WOODD); rect(d, bx + 112, by - 10, bx + 116, by + 40, WOODD)
    rect(d, bx, by - 32, bx + 4, by - 31, GOLD)
    rect(d, bx + 2, by + 10, bx + 114, by + 30, hx("3a2050"))
    rect(d, bx + 6, by + 2, bx + 34, by + 12, hx("e8e0f0")); rect(d, bx + 8, by - 4, bx + 32, by + 4, hx("d8d0e8"))
    rect(d, bx + 2, by + 30, bx + 114, by + 33, WOOD)
    # rug
    ell(d, 120, 150, 240, 176, hx("4a1f5a")); d.ellipse([124, 152, 236, 174], outline=GOLD)
    im.save(C("content", "rooms", "our_room", "background.png"))
    # cuddle overlays (tasteful): both wives + ChrispyNi, or one wife + ChrispyNi (one rests at a time)
    def cuddle(heads, fn):
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        for cid, x in heads:
            P = CHARS[cid]; y = by + 2
            if P["acc"] == "crown":
                for sx, hg in ((-5, 3), (0, 5), (5, 3)):
                    for k in range(hg): px(od, x + sx, y - 12 - k, GOLD)
                rect(od, x - 6, y - 12, x + 6, y - 12, GOLD)
            ell(od, x - 7, y - 8, x + 7, y + 6, hx(P["hair"])); ell(od, x - 5, y - 4, x + 5, y + 6, hx(P["skin"]))
            rect(od, x - 6, y - 6, x + 6, y - 3, hx(P["hair"]))
            if P["streak"]: rect(od, x + 2, y - 7, x + 2, y - 3, hx(P["streak"]))
            rect(od, x - 3, y + 1, x - 2, y + 1, (20, 12, 24, 255)); rect(od, x + 2, y + 1, x + 3, y + 1, (20, 12, 24, 255))
            for i in range(4): px(od, x - 7 - i, y - i // 2, hx(P["skin"])); px(od, x + 7 + i, y - i // 2, hx(P["skin"]))
        rect(od, bx + 4, by + 6, bx + 112, by + 24, hx("6a2fa8")); rect(od, bx + 4, by + 6, bx + 112, by + 7, GOLD)
        for k in range(6): px(od, bx + 30 + k * 14, by + 14, hx("ffe08a"))
        ov.save(C("content", "rooms", "our_room", fn)); return ov
    ov = cuddle([("nixie", bx + 12), ("chrispyni", bx + 26), ("noct", bx + 40)], "cuddle.png")
    cuddle([("nixie", bx + 14), ("chrispyni", bx + 30)], "cuddle_nixie.png")
    cuddle([("chrispyni", bx + 14), ("noct", bx + 30)], "cuddle_noct.png")
    return im, ov

# ---------------- templates ----------------
def font(sz=8):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def grid_template(path, fw, fh, rows, cols_max, title, feet=None, scale=1):
    """rows: list of (label, frames). Transparent cells, grid lines, labels in a side gutter."""
    G = 80
    W, H = G + fw * cols_max, 14 + fh * len(rows)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    rect(d, 0, 0, W - 1, 13, (30, 30, 40, 255)); d.text((2, 1), title, fill=(255, 255, 255, 255), font=font(9))
    for ri, (lab, n) in enumerate(rows):
        y0 = 14 + ri * fh
        rect(d, 0, y0, G - 1, y0 + fh - 1, (45, 45, 60, 255))
        d.text((3, y0 + 3), f"{ri}: {lab}", fill=(255, 220, 120, 255), font=font(9))
        d.text((3, y0 + 15), f"{n} frames", fill=(200, 200, 200, 255), font=font(8))
        for c in range(cols_max):
            x0 = G + c * fw
            if c < n:
                rect(d, x0, y0, x0 + fw - 1, y0 + fh - 1, (255, 0, 255, 22) if (c + ri) % 2 else (0, 255, 255, 22))
                d.rectangle([x0, y0, x0 + fw - 1, y0 + fh - 1], outline=(255, 255, 255, 160))
                d.text((x0 + 2, y0 + 1), str(c), fill=(255, 255, 255, 120), font=font(7))
                if feet:
                    fx, fy = x0 + feet[0], y0 + feet[1]
                    rect(d, fx - 3, fy, fx + 3, fy, (255, 40, 40, 255)); rect(d, fx, fy - 3, fx, fy + 1, (255, 40, 40, 255))
                    rect(d, x0, y0 + feet[1] + 1, x0 + fw - 1, y0 + feet[1] + 1, (255, 40, 40, 70))  # ground line
                    for gy, col in ((fh - 46, (80, 255, 120, 90)), (fh - 58, (80, 160, 255, 90))):
                        rect(d, x0 + 1, y0 + gy, x0 + 4, y0 + gy, col)   # height guides: short/tall
            else:
                rect(d, x0, y0, x0 + fw - 1, y0 + fh - 1, (60, 60, 60, 120))
    im.save(path)

def build_templates():
    T = C("templates"); os.makedirs(T, exist_ok=True)
    maxf = max(r[1] for r in ROWS)
    grid_template(os.path.join(T, "character_template_guide.png"), FW, FH, [(r[0], r[1]) for r in ROWS], maxf,
                  "CHARACTER 48x64  red cross = feet anchor (24,62)  green=short(46) blue=tall(58)", FEET)
    blank = Image.new("RGBA", (FW * maxf, FH * len(ROWS)), (0, 0, 0, 0)); bd = ImageDraw.Draw(blank)
    for ri, (lab, n, _) in enumerate(ROWS):
        for c in range(n):
            px(bd, c * FW + FEET[0], ri * FH + FEET[1], (255, 0, 0, 255))
    blank.save(os.path.join(T, "character_template_blank.png"))
    grid_template(os.path.join(T, "prop_template_guide.png"), 32, 32, [("prop (1..8 anim frames)", 8)], 8,
                  "PROP 32x32 (wide props: 64x32)  red = floor anchor (16,31)", (16, 31))
    Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(os.path.join(T, "prop_template_blank.png"))
    grid_template(os.path.join(T, "effect_template_guide.png"), 32, 32, [("effect (one-shot)", 6)], 8,
                  "EFFECT 32x32  centre = (16,16)  plays once", (16, 16))
    Image.new("RGBA", (32 * 6, 32), (0, 0, 0, 0)).save(os.path.join(T, "effect_template_blank.png"))
    r = Image.new("RGBA", (320, 180), (40, 30, 50, 255)); rd = ImageDraw.Draw(r)
    rect(rd, 0, 120, 320, 180, (60, 40, 50, 255)); rect(rd, 0, 120, 320, 120, (255, 60, 60, 255))
    rd.rectangle([110, 60, 226, 125], outline=(80, 255, 120, 255)); rd.text((112, 62), "bed / main spot", fill=(80, 255, 120, 255), font=font(8))
    rd.text((4, 4), "ROOM 320x180 (shown x3). red line = floor y=120. Put 'spots' in room.json", fill=(255, 255, 255, 255), font=font(8))
    r.save(os.path.join(T, "room_template_guide.png"))
    specs = {
      "character.template.json": {"id": "my_char", "name": "My Character", "sheet": "sheet.png", "frame": {"w": FW, "h": FH},
          "anchor": {"x": FEET[0], "y": FEET[1]}, "scale": 2, "animations": {r[0]: {"row": i, "frames": r[1], "fps": r[2]} for i, r in enumerate(ROWS)},
          "palette": {"primary": "#ffffff", "accent": "#d4a537"}, "personality": {"lines": "my_char", "talkativeness": 0.5, "moods": ["happy", "bored"]},
          "walkSpeed": 40, "castEffect": "spawn_sparkle"},
      "prop.template.json": {"id": "my_prop", "name": "My Prop", "image": "my_prop.png", "frame": {"w": 32, "h": 32}, "frames": 1, "fps": 1,
          "anchor": {"x": 16, "y": 31}, "manaCost": 5, "spawnEffect": "spawn_sparkle", "sittable": False, "tags": ["cozy"]},
      "effect.template.json": {"id": "my_effect", "name": "My Effect", "image": "my_effect.png", "frame": {"w": 32, "h": 32}, "frames": 6, "fps": 12,
          "anchor": {"x": 16, "y": 16}, "manaCost": 5, "loop": False},
      "room.template.json": {"id": "my_room", "name": "My Room", "background": "background.png", "overlay": "cuddle.png", "size": {"w": 320, "h": 180},
          "scale": 3, "floorY": 120, "spots": {"bed": {"x": 168, "y": 100}}, "manaRestorePerSecond": 4, "music": None},
    }
    for k, v in specs.items():
        json.dump(v, open(os.path.join(T, k), "w"), indent=2)

# ---------------- previews ----------------
def previews(sheets, room, ov):
    D = C("docs"); os.makedirs(D, exist_ok=True)
    S = 4
    order = ["nixie", "chrispyni", "noct"]
    # all-animation sheet preview
    for cid, sh in sheets.items():
        sh.resize((sh.width * 2, sh.height * 2), Image.NEAREST).save(os.path.join(D, f"sheet_{cid}_x2.png"))
    # lineup PNG
    bg = Image.new("RGBA", (FW * 3 * S + 40, FH * S + 20), (24, 16, 32, 255))
    for i, cid in enumerate(order):
        fr = sheets[cid].crop((0, 0, FW, FH)).resize((FW * S, FH * S), Image.NEAREST)
        bg.alpha_composite(fr, (20 + i * FW * S, 10))
    bg.save(os.path.join(D, "lineup.png"))
    # animated GIF: every row cycles
    frames = []
    for ri, (name, n, fps) in enumerate(ROWS):
        for k in range(8):
            canvas = Image.new("RGBA", (FW * 3 * 3, FH * 3 + 16), (24, 16, 32, 255)); cd = ImageDraw.Draw(canvas)
            cd.text((4, 2), name, fill=(255, 220, 120, 255), font=font(11))
            for i, cid in enumerate(order):
                f = k % n
                fr = sheets[cid].crop((f * FW, ri * FH, f * FW + FW, ri * FH + FH)).resize((FW * 3, FH * 3), Image.NEAREST)
                canvas.alpha_composite(fr, (i * FW * 3, 16))
            frames.append(canvas.convert("RGB"))
    frames[0].save(os.path.join(D, "preview.gif"), save_all=True, append_images=frames[1:], duration=160, loop=0)
    rm = room.copy(); rm.alpha_composite(ov)
    rm.resize((960, 540), Image.NEAREST).save(os.path.join(D, "room_preview.png"))

def write_icon(sheets):
    """App icon: Nixie & Noct heads side by side on a void circle (pixel art, crisp at every size)."""
    os.makedirs(C("build"), exist_ok=True)
    base = Image.new("RGBA", (64, 64), (0, 0, 0, 0)); d = ImageDraw.Draw(base)
    ell(d, 1, 1, 62, 62, hx("2a1240")); d.ellipse([1, 1, 62, 62], outline=hx("d4a537"))
    for cid, ox in (("noct", 30), ("nixie", 2)):
        P = CHARS[cid]; top = FEET[1] - P["height"]
        head = sheets[cid].crop((4, max(0, top - 4), 44, top + 30))
        base.alpha_composite(head, (ox - 4 + (0 if cid == "nixie" else -2), 64 - head.height - 4 + (0 if cid == "noct" else 4)))
    ic = base.resize((256, 256), Image.NEAREST)
    ic.save(C("build", "icon.png"))
    ic.save(C("build", "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    base.resize((32, 32), Image.NEAREST).save(C("src", "renderer", "tray.png"))

def build_food():
    os.makedirs(C("content", "food"), exist_ok=True)
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    ell(d, 1, 2, 14, 14, hx("c98a4b")); ell(d, 2, 3, 13, 12, hx("e0a865"))
    for x, y in ((5, 5), (9, 4), (7, 8), (4, 10), (10, 9)): rect(d, x, y, x + 1, y + 1, hx("4a2a18"))
    im.save(C("content", "food", "cookie.png"))

def build_hand():
    """ChrispyNi's hand reaching out of a tiny void portal (frames: open, reach, pat, pat, retract, close)."""
    P = CHARS["chrispyni"]; S = 32; n = 6
    im = Image.new("RGBA", (S * n, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    reach = [0, 6, 10, 8, 4, 0]; pr = [3, 6, 6, 6, 6, 3]
    for f in range(n):
        o = f * S
        ell(d, o + 16 - pr[f] * 2, 1, o + 16 + pr[f] * 2, 5, hx("2a1240")); d.ellipse([o + 16 - pr[f] * 2, 1, o + 16 + pr[f] * 2, 5], outline=hx("8a3fd1"))
        if reach[f]:
            L = reach[f] + 4
            rect(d, o + 13, 4, o + 18, 4 + L - 5, hx("121016")); rect(d, o + 13, 4 + L - 6, o + 18, 4 + L - 5, hx("d4a537"))
            ell(d, o + 12, 4 + L - 4, o + 19, 4 + L + 2, hx(P["skin"]))
            for k in range(4): px(d, o + 13 + k * 2, 4 + L + 3, hx(P["skin_sh"]))
    im.save(C("content", "effects", "chrispy_hand.png"))

if __name__ == "__main__":
    sheets = {cid: build_character(cid, P) for cid, P in CHARS.items()}
    os.makedirs(C("content", "props"), exist_ok=True)
    for pid, (w, h, n, fps, fn, cost, label) in PROPS.items():
        prop_img(w, h, fn, n).save(C("content", "props", f"{pid}.png"))
    os.makedirs(C("content", "effects"), exist_ok=True)
    for eid, (col, kind, n, fps, label) in EFFECTS.items():
        fx_sheet(col, kind, n).save(C("content", "effects", f"{eid}.png"))
    os.makedirs(C("content", "rooms", "our_room"), exist_ok=True)
    room, ov = build_room()
    build_templates()
    previews(sheets, room, ov)
    write_icon(sheets)
    build_food(); build_hand()
    # metadata of generated rows (for the JSON writer in tools/write_content.js / manual check)
    json.dump({"chars": {cid: {"y": 76 - P["height"], "x": [19, 28], "w": 2, "h": 3, "iris": "#" + P["eye"], "pupil": "#" + P["pupil"], "white": "#ffffff"} for cid, P in CHARS.items()}, "rows": ROWS, "props": {k: [v[0], v[1], v[2], v[3], v[5], v[6]] for k, v in PROPS.items()},
               "effects": {k: [v[2], v[3], v[4]] for k, v in EFFECTS.items()}}, open(C("tools", "generated_meta.json"), "w"), indent=1)
    print("sprites ok")
