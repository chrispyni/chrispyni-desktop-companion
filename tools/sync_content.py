#!/usr/bin/env python3
"""After changing ROWS/PROPS in gen_sprites.py: syncs animation rows into every base character.json
and adds any new generated props/effects to content/props/props.json & effects.json (keeps your edits)."""
import json, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
meta = json.load(open(os.path.join(R, 'tools', 'generated_meta.json')))
anims = {r[0]: {"row": i, "frames": r[1], "fps": r[2]} for i, r in enumerate(meta['rows'])}
for c in ('nixie', 'noct', 'chrispyni'):
    p = os.path.join(R, 'content', 'characters', c, 'character.json'); j = json.load(open(p))
    j['animations'] = anims; json.dump(j, open(p, 'w'), indent=2, ensure_ascii=False)
pp = os.path.join(R, 'content', 'props', 'props.json'); pj = json.load(open(pp)); have = {i['id'] for i in pj['items']}
EXTRA = {"door": {"door": True, "pinned": True, "aliases": ["door", "room door"]}, "void_portal": {"guestOnly": True}, "sofa": {"sittable": True, "seats": 2, "aliases": ["sofa", "couch", "loveseat"]},
         "table": {"aliases": ["table", "little table"], "surface": 14},
         "bed": {"layable": True, "seats": 3}}
for pid, (w, h, n, fps, cost, label) in meta['props'].items():
    if pid not in have:
        pj['items'].append({"id": pid, "name": label, "image": f"{pid}.png", "frame": {"w": w, "h": h}, "frames": n, "fps": fps,
                            "anchor": {"x": w // 2, "y": h - 1}, "manaCost": cost, "spawnEffect": "spawn_sparkle", "lifetimeSec": 600})
for it in pj['items']:
    for k, v in EXTRA.get(it['id'], {}).items(): it.setdefault(k, v)
json.dump(pj, open(pp, 'w'), indent=2)
print('synced')
