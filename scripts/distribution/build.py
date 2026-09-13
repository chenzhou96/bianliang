"""Build self-contained, offline desktop ZIPs from the current production client."""
import hashlib
import json
import plistlib
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/distribution'
VERSION = 'v4-r6-20260913'
OUT = ROOT / 'releases' / VERSION
CACHE = ROOT / '.runtime/distribution-cache'
LOCK = json.loads((SOURCE / 'runtime-lock.json').read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime(platform, target):
    item = LOCK['archives'][platform]
    archive = CACHE / item['file']
    CACHE.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        subprocess.run(['curl', '-fsSL', '--retry', '2', '-o', str(archive),
                        LOCK['baseUrl'] + item['file']], check=True)
    if digest(archive) != item['sha256']:
        raise RuntimeError(f'Runtime checksum mismatch: {archive}')
    target.mkdir(parents=True)
    prefix = item['file'].removesuffix('.tar.gz').removesuffix('.zip')
    if platform.startswith('win'):
        with zipfile.ZipFile(archive) as source:
            for name in ['node.exe', 'LICENSE']:
                (target / name).write_bytes(source.read(f'{prefix}/{name}'))
    else:
        with tarfile.open(archive) as source:
            for name, member in [('node', 'bin/node'), ('LICENSE', 'LICENSE')]:
                (target / name).write_bytes(source.extractfile(f'{prefix}/{member}').read())
        (target / 'node').chmod(0o755)


def text(path, content, executable=False, windows=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content.replace('\n', '\r\n').encode('utf-8') if windows else content.encode('utf-8'))
    if executable:
        path.chmod(0o755)


if '--skip-build' not in sys.argv:
    subprocess.run(['npm', 'run', 'build'], cwd=ROOT, check=True)
client = ROOT / 'dist/client'
assert (client / 'index.html').is_file(), 'Run production build first'
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
asset_hash = hashlib.sha256()
for path in sorted(client.rglob('*')):
    if path.is_file():
        asset_hash.update(str(path.relative_to(client)).encode())
        asset_hash.update(path.read_bytes())
for name in ['settings.mjs', 'server.mjs', 'launcher.mjs']:
    asset_hash.update((SOURCE / name).read_bytes())
build = dict(version=VERSION, commit=commit, buildId=asset_hash.hexdigest(),
             saveKey='bianliang-save-v4', saveRevision=6, runtime=LOCK['version'])
OUT.mkdir(parents=True, exist_ok=True)
# Include dependency license/notice text; no node_modules or developer tools are shipped.
notices = []
for path in sorted((ROOT / 'node_modules').rglob('*')):
    if path.is_file() and path.name.upper().split('.')[0] in {'LICENSE', 'LICENCE', 'NOTICE', 'COPYING'}:
        notices.append(f'\n===== {path.relative_to(ROOT / "node_modules")} =====\n' + path.read_text(errors='replace'))
for system, platforms in [('macOS', ['darwin-arm64', 'darwin-x64']), ('Windows11', ['win-x64', 'win-arm64'])]:
    folder = OUT / f'Bianliang-{VERSION}-{system}'
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir()
    if system == 'macOS':
        contents = folder / '汴梁归途.app/Contents'
        resources = contents / 'Resources'
        text(contents / 'MacOS/launcher', (SOURCE / 'templates/mac-launcher.sh').read_text(), executable=True)
        info = dict(CFBundleName='汴梁归途', CFBundleDisplayName='汴梁归途',
                    CFBundleIdentifier='game.bianliang.homecoming', CFBundleExecutable='launcher',
                    CFBundlePackageType='APPL', CFBundleVersion='6', CFBundleShortVersionString='4.6',
                    LSMinimumSystemVersion='13.0', NSHighResolutionCapable=True)
        (contents / 'Info.plist').write_bytes(plistlib.dumps(info))
        text(folder / '停止游戏.command', '#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/汴梁归途.app/Contents/MacOS/launcher" --stop\n', executable=True)
    else:
        resources = folder
        text(folder / '开始游戏.cmd', (SOURCE / 'templates/windows-launcher.cmd').read_text(), windows=True)
        text(folder / '停止游戏.cmd', '@echo off\ncall "%~dp0开始游戏.cmd" --stop\n', windows=True)
    game = resources / 'game'
    game.mkdir(parents=True)
    shutil.copytree(client, game / 'client')
    for name in ['settings.mjs', 'server.mjs', 'launcher.mjs']:
        shutil.copy2(SOURCE / name, game / name)
    text(game / 'build.json', json.dumps(build, ensure_ascii=False, indent=2) + '\n')
    for platform in platforms:
        runtime(platform, resources / 'runtime' / platform)
    shutil.copy2(ROOT / 'docs/distribution/PLAYER_GUIDE.txt', folder / '先读我.txt')
    shutil.copy2(ROOT / 'design/promotion/bianliang-poster-v1.png', folder / '汴梁归途-玩法海报.png')
    text(folder / 'THIRD_PARTY_NOTICES.txt', ''.join(notices))
    manifest = dict(**build, system=system, runtimes={p: LOCK['archives'][p] for p in platforms},
                    files={str(p.relative_to(folder)): digest(p) for p in sorted(folder.rglob('*')) if p.is_file()})
    text(folder / 'manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    archive = OUT / f'{folder.name}.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for path in sorted(folder.rglob('*')):
            if path.is_file():
                output.write(path, path.relative_to(OUT))
    with zipfile.ZipFile(archive) as output:
        assert output.testzip() is None
    print(f'{archive} ({archive.stat().st_size / 1024 / 1024:.1f} MiB)', flush=True)
shutil.copy2(ROOT / 'design/promotion/bianliang-poster-v1.png', OUT / '汴梁归途-玩法海报.png')
text(OUT / 'SHA256SUMS.txt', ''.join(f'{digest(p)}  {p.name}\n' for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'SHA256SUMS.txt'))
