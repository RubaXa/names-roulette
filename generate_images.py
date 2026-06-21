#!/usr/bin/env python3
"""Generate cover images for name cards using FLUX schnell via fal.ai."""
import urllib.request, json, os, time, glob, sys

FAL_KEY = os.environ['FAL_KEY']
PROXY = os.environ.get('HTTPS_PROXY_OVERRIDE', '')  # optional: external proxy to bypass corporate CDN blocks
OUT_DIR = os.path.join(os.path.dirname(__file__), 'data/images')

# Explicit ProxyHandler dicts bypass NO_PROXY/HTTPS_PROXY env vars entirely
direct_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
cdn_opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY} if PROXY else {})
)

ORIGIN_DATA = {
    'Латинское':  ('dusty rose, faded crimson, warm ivory',
                   'Roman laurel leaves, rose petals, Mediterranean sunrise haze, marble fragments'),
    'Греческое':  ('pale aegean blue, faded marble white, soft antique gold',
                   'Greek marble columns fading into mist, olive branches, ancient sea horizon'),
    'Арабское':   ('muted desert amber, dusty terracotta, pale gold',
                   'desert sand dunes in haze, crescent moon, arabesque geometric tracery, flowing veil'),
    'Славянское': ('muted forest green, birch white, dusty earth ochre',
                   'birch grove in morning fog, folk embroidery patterns dissolving, snowflakes, wildflowers'),
    'Германское': ('muted steel blue, silver grey, pale nordic ice',
                   'pine forest in misty dawn, ice crystal patterns, nordic rune hints, fjord silhouette'),
    'Иврит':      ('deep dusty indigo, desert sand, faded bronze',
                   'desert night sky, olive branches, ancient stone wall, dusk light'),
    'Персидское': ('soft violet, dusty turquoise, muted copper rose',
                   'Persian tile geometry softened, rose garden mist, ornate arch silhouette'),
    'Тюркское':   ('warm ochre, terracotta, faded turquoise',
                   'steppe horizon in haze, felt patterns, open sky, nomadic silhouette'),
    'Скандинавское': ('pale silver, arctic blue, ice white',
                      'northern lights haze, rune stones, fjord mist, frost patterns'),
    'Кельтское':  ('forest green, heather violet, sea grey',
                   'celtic knot patterns dissolving, misty highlands, ancient stone circle'),
}
DEFAULT_DATA = ('muted violet, dusty gold, midnight blue',
                'celestial mist, ancient patterns, starlit sky')


def build_prompt(name, origin, meaning):
    palette, motifs = ORIGIN_DATA.get(origin, DEFAULT_DATA)
    short_meaning = meaning[:60] if meaning else ''
    return (
        f'fleeting silhouette of a woman emerging from {palette} swirling color, '
        f'feminine form dissolving into abstract paint, centered, fills entire frame, '
        f'figure suggested not literal, impressionist fluid art, '
        f'background with {motifs}, scene evokes {short_meaning}, '
        f'dark background, no text, no watermark, no signature, no letters, no face'
    )


def generate(prompt):
    req = urllib.request.Request(
        'https://fal.run/fal-ai/flux/schnell',
        method='POST',
        headers={'Authorization': f'Key {FAL_KEY}', 'Content-Type': 'application/json'},
        data=json.dumps({
            'prompt': prompt,
            'image_size': 'square_hd',
            'num_inference_steps': 4,
            'guidance_scale': 5.0,
            'num_images': 1,
            'output_format': 'jpeg',
        }).encode()
    )
    with direct_opener.open(req, timeout=60) as r:
        return json.loads(r.read())


def download(url, dest, retries=3):
    for i in range(retries):
        try:
            with cdn_opener.open(url, timeout=60) as r:
                data = r.read()
            if len(data) > 50000:
                with open(dest, 'wb') as f:
                    f.write(data)
                return len(data)
            print(f'    attempt {i+1}: too small ({len(data)}b)')
        except Exception as e:
            print(f'    attempt {i+1}: {e}')
            time.sleep(2)
    return 0


def load_names():
    names = []
    for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), 'data/enriched_part_*.json'))):
        with open(f) as fp:
            names.extend(json.load(fp))
    return names


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    os.makedirs(OUT_DIR, exist_ok=True)

    names = load_names()
    if limit:
        names = names[:limit]

    print(f'Generating {len(names)} images → {OUT_DIR}')

    for i, entry in enumerate(names):
        name = entry['name']
        dest = os.path.join(OUT_DIR, f'{name}.jpg')

        if os.path.exists(dest) and os.path.getsize(dest) > 50000:
            print(f'[{i+1}/{len(names)}] {name} — skip (exists)')
            continue

        origin = entry.get('origin', '')
        meaning = entry.get('meaning', '')
        prompt = build_prompt(name, origin, meaning)

        print(f'[{i+1}/{len(names)}] {name} ({origin})')
        try:
            data = generate(prompt)
            url = data['images'][0]['url']
            size = download(url, dest)
            status = f'OK {size//1024}KB' if size else 'FAILED'
            print(f'    {status} → {dest}')
        except Exception as e:
            print(f'    ERROR: {e}')


if __name__ == '__main__':
    main()
