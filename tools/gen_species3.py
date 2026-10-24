"""从 iNaturalist 生成扩充物种名录 js/data/species3.js（每个大洲 × 类群取最受欢迎的研究级观测）"""
import json, re, sys, time, urllib.parse, urllib.request

SITE = '/Volumes/ORICO /claude/世界生物大赏'
UA = {'User-Agent': 'BiosphereAtlas/1.0 (codemanvibe@gmail.com)'}
INAT = 'https://api.inaturalist.org/v1'
last = [0.0]

def get(url, inat=True):
    if inat:
        wait = 1.05 - (time.time() - last[0])
        if wait > 0: time.sleep(wait)
        last[0] = time.time()
    for k in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception as e:
            print('  retry', k, e, file=sys.stderr); time.sleep(3 + k * 4)
    return None

REGIONS = {'asia': 'place_id=97395', 'europe': 'place_id=97391', 'africa': 'place_id=97392', 'namerica': 'place_id=97394',
           'samerica': 'place_id=97389', 'oceania': 'place_id=97393', 'antarctica': 'swlat=-90&swlng=-180&nelat=-60&nelng=180'}
CATS = [('mammal', 'iconic_taxa=Mammalia', 18), ('bird', 'iconic_taxa=Aves', 22), ('reptile', 'iconic_taxa=Reptilia', 12),
        ('amphibian', 'iconic_taxa=Amphibia', 10), ('fish', 'iconic_taxa=Actinopterygii', 12),
        ('invert', 'iconic_taxa=Insecta,Arachnida,Mollusca,Animalia', 26), ('plant', 'iconic_taxa=Plantae', 26),
        ('fungi', 'iconic_taxa=Fungi', 12), ('micro', 'taxon_id=47686,67333,48222', 5)]
ICON = {'mammal': '🐾', 'bird': '🐦', 'reptile': '🦎', 'amphibian': '🐸', 'fish': '🐟', 'plant': '🌿', 'fungi': '🍄', 'micro': '🦠'}
INV_ICON = {'Insecta': '🐞', 'Arachnida': '🕷️', 'Mollusca': '🐚'}
IUCN = {10: 'LC', 20: 'NT', 30: 'VU', 40: 'EN', 50: 'CR', 60: 'EW', 70: 'EX'}
CJK = re.compile(r'[一-鿿]')

existing = set()
for f in ['species.js', 'species2.js']:
    existing |= {m.lower() for m in re.findall(r"l:'([^']+)'", open(f'{SITE}/js/data/{f}', encoding='utf-8').read())}
print('existing', len(existing))

picked, seen = [], set(existing)
for r, rq in REGIONS.items():
    for c, cq, want in CATS:
        got = 0
        for page in range(1, 4):
            j = get(f'{INAT}/observations?{rq}&{cq}&quality_grade=research&photos=true&per_page=200&page={page}&order_by=votes&locale=zh-CN')
            if not j or not j['results']: break
            for o in j['results']:
                t = o.get('taxon') or {}
                if t.get('rank') != 'species' or not o.get('location') or not o.get('photos'): continue
                if t['name'].lower() in seen: continue
                seen.add(t['name'].lower())
                lat, lon = map(float, o['location'].split(','))
                ph = o['photos'][0]
                picked.append({'r': r, 'c': c, 'id': t['id'], 'l': t['name'], 'zh': t.get('preferred_common_name') or '', 'ico': t.get('iconic_taxon_name'),
                               'p': [round(lon, 2), round(lat, 2)], 'pu': ph['url'], 'pc': ph.get('attribution', ''), 'obs': o['id']})
                got += 1
                if got >= want: break
            if got >= want or page * 200 >= j['total_results']: break
        print(r, c, got, flush=True)
print('picked', len(picked))

# 分类详情：保护等级、简介
info = {}
ids = [p['id'] for p in picked]
for k in range(0, len(ids), 30):
    j = get(f'{INAT}/taxa/{",".join(map(str, ids[k:k + 30]))}?locale=zh-CN')
    for t in (j or {}).get('results', []):
        st = 'NE'
        for cs in t.get('conservation_statuses') or []:
            if (cs.get('authority') or '').startswith('IUCN') and not cs.get('place') and cs.get('iucn') in IUCN: st = IUCN[cs['iucn']]; break
        info[t['id']] = {'s': st, 'sum': re.sub(r'<[^>]+>', '', t.get('wikipedia_summary') or '').strip(), 'zh': t.get('preferred_common_name') or '', 'en': t.get('english_common_name') or ''}
    print('taxa', k, flush=True)

# 没有中文名的，用 Wikidata 批量补
need = [p['l'] for p in picked if not CJK.search(info.get(p['id'], {}).get('zh') or p['zh'])]
wd = {}
for k in range(0, len(need), 80):
    vals = ' '.join(json.dumps(n) for n in need[k:k + 80])
    q = f'SELECT ?la ?zh WHERE {{ VALUES ?la {{ {vals} }} ?item wdt:P225 ?la . ?item rdfs:label ?zh FILTER(LANG(?zh) IN ("zh-hans","zh-cn","zh")) }}'
    j = get('https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q), inat=False)
    rank = {'zh-hans': 3, 'zh-cn': 2, 'zh': 1}
    for b in (j or {}).get('results', {}).get('bindings', []):
        la, lg, v = b['la']['value'], b['zh']['xml:lang'], b['zh']['value']
        if v != la and (la not in wd or rank[lg] > wd[la][0]): wd[la] = (rank[lg], v)
print('wikidata zh', len(wd), 'of', len(need))

out = []
for p in picked:
    i = info.get(p['id'], {})
    zh = next((x for x in [i.get('zh'), p['zh'], wd.get(p['l'], (0, ''))[1]] if x and CJK.search(x)), '')
    if not zh: continue
    p.update(n=zh, s=i.get('s', 'NE'), sum=i.get('sum', ''), en=i.get('en', ''))
    out.append(p)
print('with zh names', len(out))

# 简介：中文维基百科（简体）首段
ext = {}
titles = [p['n'] for p in out]
for k in range(0, len(titles), 20):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'extracts', 'exintro': 1, 'explaintext': 1, 'exlimit': 20,
                                'redirects': 1, 'converttitles': 1, 'variant': 'zh-cn', 'titles': '|'.join(titles[k:k + 20])})
    j = get('https://zh.wikipedia.org/w/api.php?' + q, inat=False)
    if not j: continue
    qq = j.get('query', {})
    alias = {}
    for key in ['normalized', 'converted', 'redirects']:
        for m in qq.get(key, []): alias[m['from']] = m['to']
    pages = {pg['title']: pg.get('extract', '') for pg in qq.get('pages', {}).values()}
    for t in titles[k:k + 20]:
        x = t
        for _ in range(4): x = alias.get(x, x)
        if pages.get(x): ext[t] = pages[x]
    time.sleep(0.3)
print('zh extracts', len(ext))

def trim(s, n=150):
    s = re.sub(r'\s+', ' ', s).strip()
    if len(s) <= n: return s
    cut = max(s.rfind('。', 0, n), s.rfind('；', 0, n))
    return s[:cut + 1] if cut > 40 else s[:n].rstrip('，、 ') + '…'

REG = {'asia': '亚洲', 'europe': '欧洲', 'africa': '非洲', 'namerica': '北美洲', 'samerica': '南美洲', 'oceania': '大洋洲', 'antarctica': '南极洲'}
CATZ = {'mammal': '哺乳动物', 'bird': '鸟类', 'reptile': '爬行动物', 'amphibian': '两栖动物', 'fish': '鱼类', 'invert': '无脊椎动物', 'plant': '植物', 'fungi': '真菌', 'micro': '微生物'}
rows = []
for p in out:
    d = ext.get(p['n']) or (p['sum'] if CJK.search(p['sum']) else '')
    d = trim(d) if d else f"{p['n']}是一种分布于{REG[p['r']]}的{CATZ[p['c']]}。iNaturalist 上的公民科学家已在这里记录到它的实拍照片。"
    o = {'n': p['n'], 'e': p['en'] or p['l'], 'l': p['l'], 'c': p['c'], 'r': p['r'], 'p': p['p'],
         'i': INV_ICON.get(p['ico'], '🦋') if p['c'] == 'invert' else ICON[p['c']], 's': p['s'], 'd': d,
         'ti': p['id'], 'pu': p['pu'], 'pc': p['pc']}
    rows.append(o)

hdr = ('/* 地球视角：扩充名录（由 iNaturalist 生成的快照）\n'
       '   每个大洲 × 类群取最受欢迎的研究级观测：p 为一条真实观测的位置，pu/pc 为该观测的实拍照片与署名，ti 为 iNaturalist 分类 ID；\n'
       '   简介来自中文维基百科首段，保护等级来自 iNaturalist 收录的 IUCN 评估（NE 表示未查到评估） */\n'
       'window.BIO = window.BIO || {}; BIO.data = BIO.data || {};\nBIO.data.species.push(\n')
body = ',\n'.join(json.dumps(o, ensure_ascii=False, separators=(',', ':')) for o in rows)
open(f'{SITE}/js/data/species3.js', 'w', encoding='utf-8').write(hdr + body + '\n);\n')
from collections import Counter
print('written', len(rows), Counter(o['c'] for o in rows), Counter(o['r'] for o in rows), Counter(o['s'] for o in rows))
