import { readFile, mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { settings } from './settings.mjs';

const base = dirname(fileURLToPath(import.meta.url));
async function main() {
  const build = JSON.parse(await readFile(join(base, 'build.json'), 'utf8'));
  const { port, dataDir, stateFile } = settings();
  const url = `http://127.0.0.1:${port}`;
  const health = async () => {
    try {
      return await (
        await fetch(`${url}/__game_health`, {
          signal: AbortSignal.timeout(500),
        })
      ).json();
    } catch {
      return null;
    }
  };
  if (process.argv.includes('--stop')) {
    const state = await readFile(stateFile, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    const running = await health();
    if (
      !state ||
      running?.app !== 'bianliang-homecoming-portable' ||
      running.pid !== state.pid
    ) {
      console.log('游戏服务没有运行；未停止其他程序。');
      return;
    }
    const response = await fetch(`${url}/__game_stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw Error('无法确认游戏服务身份，未停止其他程序。');
    console.log('游戏服务已停止，浏览器中的存档保留。');
    return;
  }
  let running = await health();
  if (
    running &&
    (running.app !== 'bianliang-homecoming-portable' ||
      running.buildId !== build.buildId)
  )
    throw Error(
      `端口${port}已有其他程序或不同版本。请先使用原游戏的“停止游戏”，不要随意更换端口以免看不到原存档。`,
    );
  if (!running) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const log = await open(join(dataDir, 'server.log'), 'a', 0o600);
    const child = spawn(process.execPath, [join(base, 'server.mjs')], {
      cwd: base,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log.fd, log.fd],
      env: process.env,
    });
    let spawnError;
    child.on('error', (e) => {
      spawnError = e;
    });
    child.unref();
    await log.close();
    for (let i = 0; i < 40; i++) {
      running = await health();
      if (
        running?.app === 'bianliang-homecoming-portable' &&
        running.buildId === build.buildId
      )
        break;
      if (spawnError) throw spawnError;
      await pause(150);
    }
    if (
      running?.app !== 'bianliang-homecoming-portable' ||
      running.buildId !== build.buildId
    )
      throw Error(
        `游戏未能启动。端口${port}可能被占用；请查看 ${join(dataDir, 'server.log')}`,
      );
  }
  if (process.env.BIANLIANG_NO_BROWSER !== '1') {
    const child =
      process.platform === 'win32'
        ? spawn(
            process.env.ComSpec ?? 'cmd.exe',
            ['/d', '/c', 'start', '', url],
            { detached: true, stdio: 'ignore', windowsHide: true },
          )
        : spawn('/usr/bin/open', [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      console.log(`请在浏览器打开 ${url}`);
    });
    child.unref();
  }
  console.log(`游戏已就绪：${url}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
