param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
if (-not $env:SystemRoot) { $env:SystemRoot='C:\Windows' }
if (-not $env:WINDIR) { $env:WINDIR=$env:SystemRoot }
if (-not $env:ComSpec) { $env:ComSpec=Join-Path $env:SystemRoot 'System32\cmd.exe' }
$url='http://127.0.0.1:4173'
$env:PORT='4173'
$ready=$false
try { $health=Invoke-RestMethod -Uri "$url/__game_health" -TimeoutSec 2; $ready=$health.app -eq 'bianliang-homecoming' } catch {}
if (-not $ready) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist\client\index.html'))) { throw '缺少构建结果，请先按 README 构建项目。' }
  $candidates=@((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'), 'C:\Program Files\nodejs\node.exe')
  $node=$candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $node) { $node=(Get-Command node -ErrorAction SilentlyContinue).Source }
  if (-not $node) { throw '未找到 Node.js。请安装 Node.js 22.13 或更新版本。' }
  $runtime=Join-Path $PSScriptRoot '.runtime'
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  $serverScript=Join-Path $PSScriptRoot 'scripts\serve.mjs'
  $process=Start-Process -FilePath $node -ArgumentList ('"'+$serverScript+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'server.log') -RedirectStandardError (Join-Path $runtime 'server-error.log')
  for($i=0;$i -lt 30;$i++) { Start-Sleep -Milliseconds 200; try { $health=Invoke-RestMethod -Uri "$url/__game_health" -TimeoutSec 1; if($health.app -eq 'bianliang-homecoming'){$ready=$true;break} } catch {} }
  if(-not $ready) { throw '游戏服务未能启动。4173 端口可能被占用，请查看 .runtime/server-error.log。' }
  [IO.File]::WriteAllText((Join-Path $runtime 'server.pid'),[string]$process.Id)
}
if(-not $NoBrowser) { Start-Process $url }
Write-Host "游戏已就绪：$url"
