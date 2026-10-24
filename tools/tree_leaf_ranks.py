import json,time,urllib.request,urllib.parse,collections
UA={'User-Agent':'BiosphereAtlas/1.0 (codemanvibe@gmail.com)'}
res=[]
for line in open('leaves.txt'):
    n,l=line.rstrip('\n').split('|',1)
    q=l.split(' · ')[0].strip()
    try: j=json.load(urllib.request.urlopen(urllib.request.Request('https://api.inaturalist.org/v1/taxa?is_active=true&per_page=10&q='+urllib.parse.quote(q),headers=UA),timeout=30))
    except Exception as e: j={'results':[]}
    t=next((t for t in j['results'] if t['name'].lower()==q.lower()),None)
    res.append([n,l,t and t['rank'],t and t['id'],t and t.get('rank_level')])
    time.sleep(1.05)
json.dump(res,open('leaf_ranks.json','w'),ensure_ascii=False)
print(collections.Counter(r[2] for r in res))
print([r[0]+'('+r[1]+')' for r in res if not r[2]])
