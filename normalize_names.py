#!/usr/bin/env python3
"""Normalize names dataset: merge duplicates, recalculate popularity."""
import json, math, copy

MERGE_GROUPS = [
    ('Хадиджа', ['Хадижа', 'Хадича']),
    ('Марьям',  ['Мариям', 'Марям', 'Мариам']),
    ('Камилла', ['Камила']),
    ('Ясмина',  ['Ясмин']),
    ('Жасмин',  ['Жасмина']),
    ('Сумайя',  ['Сумая']),
    ('Наталья', ['Наталия']),
]
REMOVE = {d for _, dupes in MERGE_GROUPS for d in dupes}

# ── female_names.json: merge counts ──────────────────────────────────────────
with open('data/female_names.json') as f:
    pop = json.load(f)

for canon, dupes in MERGE_GROUPS:
    if canon not in pop:
        pop[canon] = {'total': 0, 'byYear': {}}
    for d in dupes:
        if d not in pop:
            continue
        src = pop[d]
        pop[canon]['total'] += src.get('total', 0)
        for year, cnt in src.get('byYear', {}).items():
            pop[canon].setdefault('byYear', {})[year] = \
                pop[canon]['byYear'].get(year, 0) + cnt
        del pop[d]

with open('data/female_names.json', 'w') as f:
    json.dump(pop, f, ensure_ascii=False, indent=2)
print(f'female_names.json: {len(pop)} entries')

# ── names_enriched.json: remove dupes, recalc popularity ─────────────────────
with open('data/names_enriched.json') as f:
    enriched = json.load(f)

enriched = [n for n in enriched if n['name'] not in REMOVE]

# Recalculate log-normalized popularity from merged pop data
all_totals = [pop.get(n['name'], {}).get('total', 0) for n in enriched]
max_total = max(all_totals) if all_totals else 1
log_max = math.log(max_total + 1)

for n in enriched:
    raw = pop.get(n['name'], {}).get('total', 0)
    n['popularity'] = round(math.log(raw + 1) / log_max, 4) if raw > 0 else 0.0

with open('data/names_enriched.json', 'w') as f:
    json.dump(enriched, f, ensure_ascii=False, indent=2)
print(f'names_enriched.json: {len(enriched)} entries')
print(f'Max popularity name: {enriched[0]["name"]} = {enriched[0]["popularity"]}')

# ── Print canonical name list for ALL_NAMES in index.html ────────────────────
names_list = [n['name'] for n in enriched]
print(f'\nALL_NAMES count: {len(names_list)}')
print(repr(names_list))
