$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ErrorActionPreference='Stop'
$pidFile=Join-Path $projectRoot '.runtime\server.pid'
if(-not(Test-Path -LiteralPath $pidFile)){Write-Host '没有由启动器记录的游戏服务。';exit}
$gameProcessId=[int]([IO.File]::ReadAllText($pidFile))
$gameProcess=Get-CimInstance Win32_Process -Filter "ProcessId = $gameProcessId" -ErrorAction SilentlyContinue
$expectedScript=Join-Path $projectRoot 'scripts\serve.mjs'
if($gameProcess -and $gameProcess.CommandLine -and $gameProcess.CommandLine.Contains($expectedScript)) {
  Stop-Process -Id $gameProcessId
  Write-Host '游戏服务已停止。浏览器中的存档保留。'
} else { Write-Host '没有找到匹配的游戏进程，未停止其他程序。' }
