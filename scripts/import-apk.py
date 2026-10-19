#!/usr/bin/env python3
"""Reproducible, read-only import of the supplied 1.0.3 campus data.

Only the two data modules are evaluated in an empty, time-limited JS context.
The Cordova application is never executed. No source archive paths are extracted.
Requires Python 3, lxml and Node 22+.
"""
import collections
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
apk = Path(sys.argv[1])
apk_hash = hashlib.sha256(apk.read_bytes()).hexdigest()
if apk_hash != '30f7570ac8e3a7c2832ded841b3d066dfc3a21fc4f78600337ef8b38503384aa':
    raise ValueError('This adapter only accepts the audited 1.0.3 APK. Review a new version before adding an adapter.')
with zipfile.ZipFile(apk) as z:
    info = z.getinfo('assets/www/bundle.js')
    if info.file_size > 20_000_000:
        raise ValueError('Unexpected bundle size')
    bundle = z.read(info).decode('utf8')

extractor = r'''
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const context = Object.create(null);
for (const name of ['MAP_CACHE', 'ROOM_DESCRIPTIONS']) {
  const start = source.indexOf(name + '=function');
  const closing = '}(' + name + '||{})';
  const end = source.indexOf(closing, start);
  if (start < 0 || end < start) throw Error('Data module missing: ' + name);
  context[name] = {};
  vm.runInNewContext(source.slice(start, end + closing.length), context,
    { timeout: 3000, codeGeneration: { strings: false, wasm: false } });
}
const descriptions = {};
for (const room of Object.values(context.MAP_CACHE.structures.rooms)) {
  descriptions[room.name] = context.ROOM_DESCRIPTIONS.getDescription(room.name) || '';
}
process.stdout.write(JSON.stringify({ cache: context.MAP_CACHE, descriptions }));
'''
with tempfile.TemporaryDirectory() as temp:
    p = Path(temp) / 'bundle.js'
    p.write_text(bundle)
    extracted = json.loads(subprocess.check_output(['node', '-e', extractor, str(p)], timeout=10))

cache = extracted['cache']
source = cache['structures']
# The legacy app adds seven searchable entrance names after loading MAP_CACHE.
# Import them as data too; otherwise a static-only extraction loses real functionality.
helper_entrances = {
    'rect10827': ('Главный вход', 'Main entrance'),
    'rect11031': ('Вход в корпус Н (Интернет-центр)', 'Building N entrance (Internet centre)'),
    'rect11119': ('Вход в библиотечный корпус', 'Library building entrance'),
    'rect10997': ('Вход в корпус А', 'Building A entrance'),
    'rect11137': ('Вход в корпус Л', 'Building L entrance'),
    'rect11305': ('Вход в Бассейн', 'Pool entrance'),
    'rect11303': ('Вход в комбинат питания', 'Dining complex entrance'),
}
tree = html.fromstring(cache['markup'])
buildings_info = {
    'main': ('Главный корпус', 'Main building', 'Главный', 'Main'),
    'A': ('Корпус А', 'Building A', 'А', 'A'),
    'N': ('Корпус Н', 'Building N', 'Н', 'N'),
    'L': ('Корпус Л', 'Building L', 'Л', 'L'),
    'C': ('Корпус С', 'Building S', 'С', 'S'),
    'lib': ('Библиотека', 'Library', 'Библиотека', 'Library'),
    'pool': ('Бассейн и спортзал', 'Pool and gym', 'Бассейн', 'Pool'),
    'rest': ('Столовая', 'Dining hall', 'Столовая', 'Dining'),
}
translations = {
    'кк№3': 'Computer lab 3', 'кк№4': 'Computer lab 4',
    'Главный вход': 'Main entrance', 'Главная лестница': 'Main staircase',
    'Бассейн': 'Swimming pool', 'Музей': 'Museum', 'Зоо музей': 'Zoological museum',
    'Ж': 'Women’s restroom', 'М': 'Men’s restroom', 'Буфет': 'Cafeteria',
    'Столовая': 'Dining hall', 'Обеденный зал': 'Dining room', 'Кафе Алькор': 'Alkor café',
    'Гардероб': 'Cloakroom', 'Спортзал': 'Gym', 'Лифтовый холл': 'Lift lobby',
    'Актовый зал': 'Assembly hall', 'Холл': 'Lobby', 'Советник ректора': 'Rector’s adviser',
    'Управление кадров ППС': 'Faculty HR office', 'Приемная проректора': 'Vice-rector’s office',
    'Управление кадров студ отдел': 'Student records office',
    'Управление кадров общий отдел': 'General HR office',
    'Отдел делопроизводства': 'Records office', 'УМУ': 'Academic affairs office',
    'НИЧ': 'Research office', 'РИО': 'Publishing office',
    'Отдел инт собственности': 'Intellectual property office',
}
latin = str.maketrans({'А':'A','а':'a','Н':'N','н':'n','Л':'L','л':'l','С':'S','с':'s','Б':'B','б':'b','В':'V','в':'v','К':'K'})
def localized(ru, en): return {'ru': ru, 'en': en}
def category(name, desc, stair):
    if stair: return 'stairs'
    if name in ['Ж', 'М']: return 'toilet'
    if 'вход' in name.lower() or name in ['ВвА', 'СВ']: return 'entrance'
    if re.search('Буфет|Столовая|Обеденный|Кафе', name): return 'food'
    if re.search('музей', name, re.I) or 'музей' in desc.lower(): return 'museum'
    if name in ['Бассейн', 'Спортзал']: return 'sport'
    if 'библиотек' in desc.lower() or 'читальн' in desc.lower(): return 'library'
    if name and not re.search(r'\d', name): return 'office'
    return 'room'

geometries, places, room_buildings, node_buildings = [], [], {}, {}
for floor in range(1, cache['floorNum'] + 1):
    svg = tree.get_element_by_id(f'floor{floor}')[0]
    for group in svg:
        building = (group.get('id') or '').rsplit('-', 1)[0]
        if building not in buildings_info: continue
        footprint, walls = [], []
        for subgroup in group:
            gid = subgroup.get('id', '')
            if 'backgr' in gid:
                footprint = [p.get('d') for p in subgroup.iter('path') if p.get('d')]
            if 'floorPlan' in gid:
                walls = [p.get('d') for p in subgroup.iter('path') if p.get('d')]
            if 'graph' in gid:
                for rect in subgroup.iter('rect'):
                    rid = rect.get('id')
                    if rid not in source['rooms']: continue
                    room = source['rooms'][rid]
                    name, desc = room['name'], extracted['descriptions'].get(room['name'], '')
                    if rid in helper_entrances and not name:
                        name = helper_entrances[rid][0]
                    cat = category(name, desc, room.get('stair'))
                    ru = name if name and name != '...' else ('Лестница' if cat == 'stairs' else 'Помещение без номера')
                    en = translations.get(name, name.translate(latin) if name and name != '...' else ('Staircase' if cat == 'stairs' else 'Unnumbered room'))
                    if rid in helper_entrances: en = helper_entrances[rid][1]
                    if re.fullmatch(r'[\dА-Яа-яA-Za-z-]+', name) and any(c.isdigit() for c in name):
                        en = 'Room ' + name.translate(latin)
                    x,y,w,h = [float(rect.get(a, 0)) for a in ['x','y','width','height']]
                    places.append({
                        'id': rid, 'name': localized(ru,en), 'originalName': name,
                        'description': localized(desc,''), 'category': cat, 'buildingId': building,
                        'floor': floor, 'x': x, 'y': y, 'width': w, 'height': h,
                        'nodeIds': room['entrances'], 'aliases': list(dict.fromkeys([name, name.translate(latin)])) if name else [],
                        'source': 'apk-1.0.3', 'verified': False,
                    })
                    room_buildings[rid] = building
                    for nid in room['entrances']: node_buildings[nid] = building
        geometries.append({'floor':floor, 'buildingId':building, 'footprint':footprint, 'walls':walls})

outdoor_nodes = set()
territory = tree.get_element_by_id('ter-graph')
for path in territory.iter('path'):
    edge = source['arcs'].get(path.get('id'))
    if edge: outdoor_nodes.update(edge['nodes'])

nodes = [{'id':nid, 'x':n['position']['x'], 'y':n['position']['y'], 'floor':n['floor'],
          'environment':'outdoor' if nid in outdoor_nodes else 'indoor',
          **({'buildingId':node_buildings[nid]} if nid in node_buildings else {})}
         for nid,n in source['nodes'].items()]
edges = [{'id':eid, 'from':e['nodes'][0], 'to':e['nodes'][1], 'cost':e['length'],
          'kind':'stairs' if eid.startswith('stairArc') else 'walk',
          'accessible':'no' if eid.startswith('stairArc') else 'unknown',
          'bidirectional':True, 'closed':False} for eid,e in source['arcs'].items()]

buildings = []
for bid, (ru,en,sru,sen) in buildings_info.items():
    boxes = cache['corp']['c'][bid]
    minx = min(b['start']['x'] for b in boxes); miny = min(b['start']['y'] for b in boxes)
    maxx = max(b['end']['x'] for b in boxes); maxy = max(b['end']['y'] for b in boxes)
    targets = sorted({p['floor'] for p in places if p['buildingId'] == bid})
    # An outdoor/indoor boundary node is a building entrance; avoid routing through arbitrary rooms.
    candidate = set()
    for e in edges:
        a,b = e['from'],e['to']
        if a in outdoor_nodes and b not in outdoor_nodes and node_buildings.get(a)==bid: candidate.add(a)
        if b in outdoor_nodes and a not in outdoor_nodes and node_buildings.get(b)==bid: candidate.add(b)
    if bid == 'main': candidate.update(source['rooms']['rect10827']['entrances'])
    buildings.append({'id':bid, 'name':localized(ru,en), 'shortName':localized(sru,sen),
                      'center':{'x':(minx+maxx)/2,'y':(miny+maxy)/2},
                      'bounds':{'x':minx,'y':miny,'width':maxx-minx,'height':maxy-miny},
                      'floors':targets,'nodeIds':sorted(candidate)})
    places.append({'id':'building-'+bid, 'name':localized(ru,en), 'originalName':ru,
                   'description':localized('Входы в корпус по схеме исходного приложения.','Entrances from the original campus plan.'),
                   'category':'building','buildingId':bid,'floor':1,'x':(minx+maxx)/2,'y':(miny+maxy)/2,
                   'width':0,'height':0,'nodeIds':sorted(candidate),'aliases':[ru,en,sru,sen],
                   'source':'derived-apk-1.0.3','verified':False})

context_shapes = [{'path':p.get('d'),'levels':int(p.get('levels','1'))} for p in tree.get_element_by_id('b-level-1').iter('path')]
data = {'schemaVersion':1,'id':'kubsu-main','version':'legacy-1.0.3-import.1',
        'title':localized('Главный кампус КубГУ','KubSU main campus'),
        'address':localized('Краснодар, Ставропольская, 149','149 Stavropolskaya St, Krasnodar'),
        'source':{'name':localized('КубГУ навигатор','KubSU Navigator'),'version':'1.0.3','uri':None,'sha256':apk_hash,'importedAt':'2026-10-17','verifiedAt':None},
        'coordinates':{'system':'local','metersPerUnit':None,'geoReference':None},
        'floors':list(range(1,6)),'buildings':buildings,'places':places,'nodes':nodes,'edges':edges,
        'geometry':geometries,'contextShapes':context_shapes}
out=ROOT/'src/data/campus.json';out.parent.mkdir(parents=True,exist_ok=True)
translations = json.loads((ROOT/'src/data/translations/en.legacy.json').read_text())
for place in places:
    place['searchable'] = bool(place['originalName'] and place['originalName'] != '...') or place['category'] == 'stairs'
    place['description']['en'] = translations.get(place['description']['ru'], place['description']['en'])

adj={n['id']:[] for n in nodes}
for e in edges:adj[e['from']].append(e['to']);adj[e['to']].append(e['from'])
seen=set();components=[]
for nid in adj:
    if nid in seen:continue
    queue=[nid];seen.add(nid)
    for cur in queue:
        for nxt in adj[cur]:
            if nxt not in seen:seen.add(nxt);queue.append(nxt)
    components.append(queue)
missing_geometry=sorted(set(source['rooms'])-set(room_buildings))
stats={'apkSha256':data['source']['sha256'],'originalRooms':len(source['rooms']),
       'importedRooms':len(room_buildings),'missingRoomGeometry':missing_geometry,
       'namedRooms':sum(bool(p['originalName'] and p['originalName']!='...') for p in places if p['category']!='building'),
       'originalNameIndex':len(source['roomNames']),'nodes':len(nodes),'edges':len(edges),
       'components':[len(c) for c in sorted(components,key=len,reverse=True)],
       'isolatedComponents':[c for c in components if len(c)<10],
       'roomsWithoutEntrances':[p['id'] for p in places if not p['nodeIds'] and p['category']!='building'],
       'crossFloorEdges':sum(source['nodes'][e['from']]['floor']!=source['nodes'][e['to']]['floor'] for e in edges),
       'floors':5,'buildingGroups':len(buildings),'untranslatedDescriptions':sum(bool(p['description']['ru'] and not p['description']['en']) for p in places)}
(ROOT/'docs').mkdir(exist_ok=True)
(ROOT/'docs/import-audit.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
print(json.dumps({**stats,'roomsWithoutEntrances':len(stats['roomsWithoutEntrances'])},ensure_ascii=False,indent=2))

from curate_campus import curate
data = curate(data, source['roomNames'])
out.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
