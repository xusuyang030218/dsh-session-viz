import json, os
from collections import defaultdict

dst_dir = r'D:\dsh-session-viz\decoded-sessions'
all_types = defaultdict(lambda: {'count': 0, 'fields': set(), 'samples': []})

for root, dirs, files in os.walk(dst_dir):
    for f in files:
        if f.endswith('.json'):
            path = os.path.join(root, f)
            for line in open(path, encoding='utf-8'):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except:
                    continue
                t = obj.get('type', 'unknown')
                all_types[t]['count'] += 1
                top_keys = set(obj.keys())
                all_types[t]['fields'].update(top_keys)
                data = obj.get('data', {})
                if isinstance(data, dict):
                    all_types[t]['fields'].update(f'data.{k}' for k in data.keys())
                if len(all_types[t]['samples']) < 1:
                    sample = {}
                    for k, v in obj.items():
                        if k == 'data':
                            sample['data'] = {}
                            if isinstance(v, dict):
                                for dk, dv in v.items():
                                    if isinstance(dv, str):
                                        sample['data'][dk] = dv[:200]
                                    elif isinstance(dv, list):
                                        sample['data'][dk] = f'list[{len(dv)}]'
                                    elif isinstance(dv, dict):
                                        sample['data'][dk] = f'dict keys: {list(dv.keys())}'
                                    else:
                                        sample['data'][dk] = str(dv)[:200]
                        else:
                            sample[k] = v
                    all_types[t]['samples'].append(sample)

for t, info in sorted(all_types.items(), key=lambda x: -x[1]['count']):
    print(f'\n=== {t} (count={info["count"]}) ===')
    print(f'  Fields: {sorted(info["fields"])}')
    if info['samples']:
        s = info['samples'][0]
        for k in sorted(s.keys()):
            print(f'  {k}: {s[k]}')
