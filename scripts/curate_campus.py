"""Apply evidence-backed corrections after lossless APK extraction. No proximity merging."""
import copy
import json
import math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def curate(data, original_name_index):
    m = json.loads((ROOT / 'src/data/curation.json').read_text())
    places = {p['id']: p for p in data['places']}
    audit = {'revision': m['revision'], 'duplicates': [], 'assignmentChanges': [], 'conflicts': [],
             'resolvedClarifications': [{'placeId': 'rect9524', 'room': '215',
             'decision': 'Latest user clarification confirms 215, matching the official telephone directory.'}]}
    for number in m['duplicateNumbers']:
        canonical_id = original_name_index[number]; canonical = places[canonical_id]
        candidates = [p for p in data['places'] if p['originalName'] == number]
        if len(candidates) < 2: raise ValueError('Duplicate source group changed: ' + number)
        for p in candidates:
            if p['id'] == canonical_id: continue
            same = (p['floor'] == canonical['floor'] and p['buildingId'] == canonical['buildingId'] and
                    all(abs(p[k] - canonical[k]) < 0.01 for k in ['x', 'y', 'width', 'height']))
            audit['duplicates'].append({'originalName':number,'canonicalId':canonical_id,'suppressedId':p['id'],
                'sameGeometry':same,'previousDescription':copy.deepcopy(p['description'])})
            p.update(name={'ru':'Помещение — номер уточняется','en':'Room — number unconfirmed'},
                     description={'ru':'Номер на архивной схеме повторяется. Назначение помещения требует уточнения.',
                                  'en':'The archived plan repeats this number. The room assignment needs verification.'},
                     category='room',aliases=[],searchable=False,catalogStatus='unresolved',
                     evidenceIds=['user-2026-10-19'],source='curation-2026-10-19')
            if same: p.update(mapVisible=False,duplicateOf=canonical_id)
    for place_id in m['clearAssignments']:
        p=places[place_id];audit['assignmentChanges'].append({'id':place_id,'previousDescription':copy.deepcopy(p['description'])})
        p.update(description={'ru':'','en':''},category='room',source='curation-2026-10-19',evidenceIds=['user-2026-10-19'])
    for change in m['corrections']:
        p=places[change['id']]
        audit['assignmentChanges'].append({'id':p['id'],'previousName':copy.deepcopy(p['name']),'previousDescription':copy.deepcopy(p['description'])})
        p.update(copy.deepcopy(change),source='curation-2026-10-19',catalogStatus='curated',searchable=True)
    # Explicit user-confirmed indoor connection; diagram units, not metres/GPS.
    landing={'id':'curated-main-l-landing','x':303.0932,'y':489.59381,'floor':2,'environment':'indoor','buildingId':'main'}
    data['nodes'].append(landing);nodes={n['id']:n for n in data['nodes']}
    for start,end in [('node992',landing['id']),('node997',landing['id']),(landing['id'],'node1023')]:
        a,b=nodes[start],nodes[end]
        edge={'id':f'curated-{start}-{end}','from':start,'to':end,'cost':math.hypot(a['x']-b['x'],a['y']-b['y']),
              'kind':'walk','accessible':'unknown','bidirectional':True,'closed':False,'evidenceIds':['user-2026-10-19','vtour']}
        if end=='node1023':edge['instruction']={'ru':'Пройдите по внутреннему переходу между главным корпусом и корпусом Л, 2 этаж',
                                               'en':'Take the indoor passage between the main building and L wing on floor 2'}
        data['edges'].append(edge)
    wing=next(b for b in data['buildings'] if b['id']=='L');wing.update(parentBuildingId='main',name={'ru':'Корпус Л','en':'L wing'})
    wing['nodeIds'].append('node1023');places['building-L'].update(nodeIds=wing['nodeIds'].copy(),floor=2)
    next(g for g in data['geometry'] if g['floor']==2 and g['buildingId']=='main')['footprint'].append('M300.996 485.39945H305.1904V489.59381H300.996Z')
    for addition in m['outdoorPlaces']:
        p=copy.deepcopy(addition)
        for i in p.pop('contextIndices'):data['contextShapes'][i]['placeId']=p['id']
        data['places'].append(p)
    for place_id,ids in m['outdoorLinks'].items():places[place_id]['outdoorFeatureIds']=ids
    for i in [9,10,11,12,13]:data['contextShapes'][i].update(levels=0,kind='track' if i==13 else 'outline')
    layers=json.loads((ROOT/'src/data/reference/stadium-layers.json').read_text());sx,sy=109.06/4209.5,244.65/8380
    for name in ['stadium-floor-1','stadium-field','stadium-lines']:
        layer=layers[name];t=layer['translate']
        data['contextShapes'].append({'path':layer['path'],'levels':0,'placeId':'campus-stadium','kind':'marking' if name=='stadium-lines' else 'field',
            'transform':[sx,0,0,sy,370.2+(t[0]-14060)*sx,152.4+(t[1]-4200)*sy]})
    data['contextShapes'].append({'path':'M43 80H108V120H43Z','levels':0,'kind':'field','placeId':'campus-mini-football'})
    data.update(version='legacy-1.0.3-curated.'+m['revision'],evidenceSources=m['evidenceSources'],contextBounds={'x':30,'y':50,'width':550,'height':490})
    audit.update(addedNodes=[landing['id']],addedEdges=[e['id'] for e in data['edges'] if e['id'].startswith('curated-')],
        addedPlaces=[p['id'] for p in m['outdoorPlaces']],retainedLegacyRoomGeometry=sum(p['id'].startswith('rect') for p in data['places']),
        totalPlaces=len(data['places']),totalNodes=len(data['nodes']),totalEdges=len(data['edges']))
    (ROOT/'docs/curation-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    return data
