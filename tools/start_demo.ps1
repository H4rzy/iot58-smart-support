param([switch]$Auto)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  $healthy = $false
  try { $healthy = (Invoke-RestMethod 'http://localhost:1880/api/iot58/health' -TimeoutSec 3).ok } catch {}
  if (-not $healthy) {
    Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/node-red/red.js','--userDir','.','--settings','settings.js') -WorkingDirectory (Join-Path $projectRoot 'node-red') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'demo-node-red.log') -RedirectStandardError (Join-Path $projectRoot 'demo-node-red-error.log') | Out-Null
  }
  $deadline = (Get-Date).AddSeconds(35)
  do {
    try { $health = Invoke-RestMethod 'http://localhost:1880/api/iot58/health' -TimeoutSec 3 } catch { $health = $null }
    if ($health.ok -and $health.mqtt.connected) { break }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  if (-not $health.ok -or -not $health.mqtt.connected) { throw 'Node-RED/MQTT chưa sẵn sàng. Xem demo-node-red*.log và cấu hình broker.' }
  if ($Auto) { node tools/run_demo.js --auto } else { node tools/run_demo.js }
  if ($LASTEXITCODE -ne 0) { throw 'Demo runner thất bại; xem thông báo ở trên.' }
  Start-Process 'http://localhost:1880/'
} finally { Pop-Location }
