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
pattern = re.compile(r'(?<![\w/.-])(config\.js|manager\.js|page-design\.js|page-editor-concurrency\.js|page-editor-audit\.js|page-editor-review\.js|page-editor-verify\.js|page-editor-schedule\.js|page-editor-tools\.js|page-editor-status\.js|page-editor-ui\.js|page-editor\.js|page-editor\.css)(?:\?v=[A-Za-z0-9_-]+)?')
state_adapter = r'''
 Object.defineProperty(window,'NKEditorState',{value:Object.freeze({
  read:()=>allowed?Object.freeze({key,version,dirty,busy}):null,
  readRemote:async(requestedKey,signal)=>{
   if(!allowed||busy||requestedKey!==key)throw new Error('편집기 준비 상태를 확인하세요.');
   const check=await sb.rpc('page_editor_is_admin');if(check.error)throw check.error;if(check.data!==true)throw new Error('관리자 권한을 확인하세요.');
   if(signal?.aborted||busy||requestedKey!==key)throw new Error('버전 조회를 취소했습니다.');
   let query=sb.from('page_editor_drafts').select('version,updated_at,updated_by').eq('page_key',requestedKey).maybeSingle();if(signal&&typeof query.abortSignal==='function')query=query.abortSignal(signal);
   const {data,error}=await query;if(error)throw error;return data?{version:data.version,updated_at:data.updated_at??null,updated_by:data.updated_by??null}:null;
  }
 })});
'''
for source in root.iterdir():
    if not source.is_file() or source.suffix.lower() not in allowed:
        continue
    target = out / source.name
    if source.suffix.lower() in {'.html', '.js'}:
        text = source.read_text(encoding='utf-8-sig')
        if source.name == 'page-editor.js':
            marker = " const status=text=>{$('status').textContent=text;};"
            if text.count(marker) != 1 or 'NKEditorState' in text:
                raise RuntimeError('Editor state adapter insertion point changed; review the controller integration')
            text = text.replace(marker, marker + state_adapter, 1)
        if source.name == 'page-editor.html':
            text = text.replace('</body>', '<script src="page-editor-status.js?v=1"></script>\n<script src="page-editor-tools.js?v=1"></script>\n<script src="page-editor-schedule.js?v=1"></script>\n<script src="page-editor-verify.js?v=1"></script>\n<script src="page-editor-review.js?v=1"></script>\n<script src="page-editor-audit.js?v=1"></script>\n<script src="page-editor-concurrency.js?v=1"></script>\n</body>')
        target.write_text(pattern.sub(lambda match: match.group(1) + '?v=' + release, text), encoding='utf-8')
    else:
        shutil.copy2(source, target)
if (root / 'app').is_dir():
    shutil.copytree(root / 'app', out / 'app', ignore=shutil.ignore_patterns('*.sql', '.DS_Store'))
(out / '.nojekyll').touch()
(out / 'release.json').write_text(json.dumps({'commit': release, 'editor': 'page-editor.html'}, indent=2), encoding='utf-8')
required = ['index.html', 'admin.html', 'page-editor.html', 'page-editor.js', 'page-editor-concurrency.js', 'page-editor-audit.js', 'page-editor-review.js', 'page-editor-verify.js', 'page-editor-schedule.js', 'page-editor-tools.js', 'page-editor-ui.js', 'page-editor-status.js', 'page-editor.css', 'page-design.js', 'config.js']
missing = [name for name in required if not (out / name).is_file()]
if missing:
    raise RuntimeError('Missing deployment files: ' + ', '.join(missing))
