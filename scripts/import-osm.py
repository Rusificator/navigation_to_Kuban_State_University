#!/usr/bin/env python3
"""Create a separate ODbL outdoor layer; never warp the legacy indoor plans."""
import json,math,sys
from pathlib import Path
from lxml import etree
root=etree.parse(sys.argv[1]).getroot()
nodes={n.get('id'):n for n in root.findall('node')}
ways={w.get('id'):w for w in root.findall('way')}
origin={'latitude':45.0202,'longitude':39.0313}
def point(n):
    return {'x':round((float(n.get('lon'))-origin['longitude'])*111320*math.cos(math.radians(origin['latitude'])),3),
            'y':round((origin['latitude']-float(n.get('lat')))*111320,3)}
def tags(e):return {t.get('k'):t.get('v') for t in e.findall('tag')}
def inside(p,poly):
    yes=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a['y']>p['y'])!=(b['y']>p['y']) and p['x']<(b['x']-a['x'])*(p['y']-a['y'])/(b['y']-a['y'])+a['x']:yes=not yes
    return yes
relation=root.xpath('relation[@id="4512079"]')[0]
chains=[[n.get('ref') for n in ways[m.get('ref')].findall('nd')] for m in relation.findall('member') if m.get('role')=='outer']
rings=[]
while chains:
    current=chains.pop(0)
    while current[-1]!=current[0]:
        for i,chain in enumerate(chains):
            if chain[0]==current[-1]:current+=chain[1:];chains.pop(i);break
            if chain[-1]==current[-1]:current+=list(reversed(chain))[1:];chains.pop(i);break
        else:raise ValueError('Open campus boundary')
    rings.append([point(nodes[n]) for n in current])
features=[]
for wid,way in ways.items():
    t=tags(way);kind='building' if 'building' in t else 'path' if 'highway' in t else 'green' if t.get('landuse') in ['grass','forest'] or t.get('leisure') in ['garden','park'] else 'sport' if 'sport' in t else None
    if not kind:continue
    points=[point(nodes[n.get('ref')]) for n in way.findall('nd') if n.get('ref') in nodes]
    if not points or not any(any(inside(p,poly) for poly in rings) for p in points):continue
    if kind=='path' and t.get('highway') not in ['footway','path','pedestrian','service','steps','cycleway']:continue
    features.append({'id':'way/'+wid,'kind':kind,'name':t.get('name',''),'points':points,'levels':t.get('building:levels'),'closed':points[0]==points[-1]})
pois=[]
for nid,n in nodes.items():
    t=tags(n);p=point(n)
    if not any(inside(p,poly) for poly in rings):continue
    if t.get('historic') or t.get('amenity')=='library':
        pois.append({'id':'node/'+nid,'name':t.get('name',''),'kind':'landmark' if t.get('historic') else 'library',**p})
allpts=[p for poly in rings for p in poly]
data={'source':'© OpenStreetMap contributors','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/',
      'sourceUrl':'https://www.openstreetmap.org/relation/4512079','retrievedAt':'2026-10-17','origin':origin,
      'boundary':rings,'bounds':{'x':min(p['x'] for p in allpts)-25,'y':min(p['y'] for p in allpts)-25,
      'width':max(p['x'] for p in allpts)-min(p['x'] for p in allpts)+50,'height':max(p['y'] for p in allpts)-min(p['y'] for p in allpts)+50},
      'features':features,'pois':pois}
dest=Path(__file__).resolve().parents[1]/'src/data/outdoors.json';dest.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'features':len(features),'pois':pois,'bounds':data['bounds']},ensure_ascii=False))
