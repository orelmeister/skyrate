import yaml
with open('C:/Users/orelm/OneDrive/Documents/GitHub/Skyrate-Super-Project/skyrate.ai/_spec.yaml') as f:
    spec = yaml.safe_load(f)

for comp in spec.get('workers', []):
    if comp['name'] == 'scheduler':
        comp['image']['repository'] = 'backend'

with open('C:/Users/orelm/OneDrive/Documents/GitHub/Skyrate-Super-Project/skyrate.ai/_spec.yaml', 'w') as f:
    yaml.dump(spec, f, sort_keys=False)
