import yaml

with open('C:/Users/orelm/OneDrive/Documents/GitHub/Skyrate-Super-Project/skyrate.ai/_spec.yaml') as f:
    spec = yaml.safe_load(f)

for comp_type in ['services', 'workers']:
    if comp_type in spec:
        for comp in spec[comp_type]:
            if 'github' in comp:
                del comp['github']
            if 'build_command' in comp:
                del comp['build_command']
            if 'environment_slug' in comp:
                del comp['environment_slug']
            
            comp['image'] = {
                'registry_type': 'DOCR',
                'registry': 'skyrate-ai',
                'repository': comp['name'],
                'tag': 'latest'
            }

with open('C:/Users/orelm/OneDrive/Documents/GitHub/Skyrate-Super-Project/skyrate.ai/_spec.yaml', 'w') as f:
    yaml.dump(spec, f, sort_keys=False)
