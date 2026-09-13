import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
export function settings() {
  const port = Number(process.env.BIANLIANG_PORT ?? 41739);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('游戏端口设置无效');
  const base =
    process.platform === 'win32'
      ? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
      : join(homedir(), 'Library', 'Application Support');
  const dataDir = process.env.BIANLIANG_DATA_DIR
    ? resolve(process.env.BIANLIANG_DATA_DIR)
    : join(base, 'BianliangGame');
  return { port, dataDir, stateFile: join(dataDir, `server-${port}.json`) };
}
