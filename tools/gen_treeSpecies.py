"""给生命树里每个还不到“种”的末端节点挂上 2 个代表物种（iNaturalist 观测最多、且有中文名的），输出 js/data/treeSpecies.js"""
import json, re, time, urllib.parse, urllib.request

SITE = '/Volumes/ORICO /claude/世界生物大赏'
UA = {'User-Agent': 'BiosphereAtlas/1.0 (codemanvibe@gmail.com)'}
CJK = re.compile(r'[一-鿿]')
PER_LEAF = 2
# 树里用的俗称 / 旧学名 → iNaturalist 里的类群名
ALIAS = {'Diatoms': 'Bacillariophyceae', 'Giant kelp': 'Macrocystis', 'Medusozoa': 'Scyphozoa', 'Teuthida': 'Decapodiformes',
         'Selachimorpha': 'Selachii', 'Dipnoi': 'Dipnomorpha', 'Crocodilia': 'Crocodylia', 'Methanogens': 'Methanobacteriota',
         'Asgard archaea': 'Promethearchaeati'}

def get(url):
    time.sleep(1.05)
    for k in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception as e: print('  retry', e); time.sleep(3 + 4 * k)
    return {'results': []}

def find(name, rank=None):
    j = get('https://api.inaturalist.org/v1/taxa?is_active=true&per_page=30&q=' + urllib.parse.quote(name) + (f'&rank={rank}' if rank else ''))
    return next((t for t in j['results'] if t['name'].lower() == name.lower()), None)

def lite(t):
    ph = t.get('default_photo') or {}
    return {'id': t['id'], 'name': t['name'], 'rank': t['rank'], 'rank_level': t.get('rank_level'), 'preferred_common_name': t.get('preferred_common_name'),
            'iconic_taxon_name': t.get('iconic_taxon_name'), 'observations_count': t.get('observations_count'), 'extinct': t.get('extinct'),
            'default_photo': {k: ph.get(k) for k in ['id', 'square_url', 'medium_url', 'attribution', 'license_code']} if ph else None}

leaves = json.load(open('leaf_ranks.json'))
out = {}
for n, l, rank, tid, lvl in leaves:
    if rank in ('species', 'subspecies'): continue
    q = ALIAS.get(l, l.split(' · ')[0].strip())
    t = None
    if tid and q == l.split(' · ')[0].strip(): t = {'id': tid, 'rank_level': lvl}
    else: t = find(q) or (find(q, 'genus') if ' ' not in q else None)
    if not t or (t.get('rank_level') or 99) <= 10: print('skip', n, l); continue
    j = get(f"https://api.inaturalist.org/v1/taxa?taxon_id={t['id']}&rank=species&is_active=true&locale=zh-CN&per_page=12&order_by=observations_count&order=desc")
    sp = [x for x in j['results'] if CJK.search(x.get('preferred_common_name') or '')][:PER_LEAF]
    if len(sp) < PER_LEAF: sp += [x for x in j['results'] if x not in sp][:PER_LEAF - len(sp)]
    out[n] = [lite(x) for x in sp]
    print(n, '→', [x.get('preferred_common_name') or x['name'] for x in sp], flush=True)

hdr = ('/* 生命树：末端类群下的代表物种（iNaturalist 观测最多、且有中文名的 2 种），让每条分支都能一直走到“种”。\n'
       '   键为 tree.js 中末端节点的中文名，值为 iNaturalist 分类数据快照 */\n'
       'window.BIO = window.BIO || {}; BIO.data = BIO.data || {};\nBIO.data.treeSpecies = ')
open(f'{SITE}/js/data/treeSpecies.js', 'w', encoding='utf-8').write(hdr + json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('],"', '],\n"') + ';\n')
print('leaves extended', len(out), 'species', sum(len(v) for v in out.values()))
