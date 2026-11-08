import json
import os
from pathlib import Path
import re
import shutil

root = Path(__file__).resolve().parents[1]
out = root / '_site'
if out.exists():
    shutil.rmtree(out)
out.mkdir()
release = os.environ['GITHUB_SHA']
allowed = {'.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.txt', '.xml', '.json', '.webmanifest'}
pattern = re.compile(r'(?<![\w/.-])(config\.js|manager\.js|page-design\.js|page-editor\.js|page-editor\.css)(?:\?v=[A-Za-z0-9_-]+)?')
for source in root.iterdir():
    if not source.is_file() or source.suffix.lower() not in allowed:
        continue
    target = out / source.name
    if source.suffix.lower() in {'.html', '.js'}:
        text = source.read_text(encoding='utf-8-sig')
        target.write_text(pattern.sub(lambda match: match.group(1) + '?v=' + release, text), encoding='utf-8')
    else:
        shutil.copy2(source, target)
if (root / 'app').is_dir():
    shutil.copytree(root / 'app', out / 'app', ignore=shutil.ignore_patterns('*.sql', '.DS_Store'))
(out / '.nojekyll').touch()
(out / 'release.json').write_text(json.dumps({'commit': release, 'editor': 'page-editor.html'}, indent=2), encoding='utf-8')
required = ['index.html', 'admin.html', 'page-editor.html', 'page-editor.js', 'page-editor.css', 'page-design.js', 'config.js']
missing = [name for name in required if not (out / name).is_file()]
if missing:
    raise RuntimeError('Missing deployment files: ' + ', '.join(missing))
