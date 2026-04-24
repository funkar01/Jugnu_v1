import json

for path in ['public/gltf/jugu1/jugu1.gltf','public/gltf/environmentDesk/environmentDesk.gltf']:
    with open(path, 'r', encoding='utf-8') as f:
        g = json.load(f)
    print('---', path)
    print('scene', g.get('scene'))
    print('nodes', len(g.get('nodes', [])))
    print('meshes', len(g.get('meshes', [])))
    if g.get('meshes'):
        for i, mesh in enumerate(g['meshes']):
            print('mesh', i, mesh.get('name'), 'primitives', [p.get('name') for p in mesh.get('primitives', [])])
    bbox_min = [float('inf')] * 3
    bbox_max = [float('-inf')] * 3
    for acc in g.get('accessors', []):
        if 'min' in acc and 'max' in acc and acc.get('type') == 'VEC3':
            for i in range(3):
                bbox_min[i] = min(bbox_min[i], acc['min'][i])
                bbox_max[i] = max(bbox_max[i], acc['max'][i])
    print('raw bbox min', bbox_min, 'max', bbox_max)
