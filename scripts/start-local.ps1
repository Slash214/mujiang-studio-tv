[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$webDir = Join-Path $repoRoot "web"
$dataDir = Join-Path $repoRoot ".local\project-workbench-debug"
$goBuildCache = Join-Path $repoRoot ".local\cache\go-build"
$goModuleCache = Join-Path $repoRoot ".local\cache\go-mod"
$goTempDir = Join-Path $repoRoot ".local\cache\go-tmp"
$logDir = Join-Path $repoRoot ".local\logs"

# Reuse portable Windows toolchains when the current terminal has an older PATH.
foreach ($toolDirectory in @("D:\tools\go\bin", "D:\tools\mingw64\bin", "D:\tools\bun\bin")) {
    if (Test-Path -LiteralPath $toolDirectory) {
        $env:Path = "$toolDirectory;$env:Path"
    }
}

foreach ($commandName in @("go", "bun", "gcc", "node")) {
    if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
        throw "未找到 $commandName，请先安装项目要求的运行时。"
    }
}

foreach ($directory in @($dataDir, $goBuildCache, $goModuleCache, $goTempDir, $logDir)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$viteBinary = Join-Path $webDir "node_modules\vite\bin\vite.js"
if (-not (Test-Path -LiteralPath $viteBinary)) {
    Write-Host "web/node_modules 不存在，正在执行 bun install --frozen-lockfile..." -ForegroundColor Yellow
    Push-Location $webDir
    try {
        & bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            throw "bun install 失败，无法启动前端。"
        }
    } finally {
        Pop-Location
    }
}

function Test-ListeningPort([int]$Port) {
    try {
        return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
    } catch {
        return $false
    }
}

foreach ($port in @(13000, 18080)) {
    if (Test-ListeningPort $port) {
        throw "端口 $port 已被占用，请先关闭占用进程后重试。"
    }
}

$powerShellPath = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $powerShellPath) {
    $powerShellPath = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
}
if (-not $powerShellPath) {
    throw "未找到 PowerShell，无法打开前后端独立窗口。"
}

function ConvertTo-PowerShellLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

$backendDirLiteral = ConvertTo-PowerShellLiteral $backendDir
$webDirLiteral = ConvertTo-PowerShellLiteral $webDir
$dataDirLiteral = ConvertTo-PowerShellLiteral $dataDir

$runtimeDir = Join-Path $repoRoot ".local\runtime"
$cliDir = Join-Path $runtimeDir "cli"
$serverBinary = Join-Path $runtimeDir "beeftv-server.exe"
$sessionFile = Join-Path $dataDir "dev-session.json"
New-Item -ItemType Directory -Force -Path $cliDir | Out-Null
$env:GOCACHE = $goBuildCache
$env:GOMODCACHE = $goModuleCache
$env:GOTMPDIR = $goTempDir
$env:GOPATH = Join-Path $repoRoot ".local\cache\go-path"
$env:CGO_ENABLED = '1'
Push-Location $backendDir
try {
    & go build -o $serverBinary ./cmd/server
    if ($LASTEXITCODE -ne 0) { throw "后端编译失败。" }
    & go build -o (Join-Path $cliDir "beeftv.exe") ./cmd/beeftv
    if ($LASTEXITCODE -ne 0) { throw "Agent CLI 编译失败。" }
} finally { Pop-Location }
Push-Location (Join-Path $repoRoot "agent-host")
try {
    & bun install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "Agent 运行时依赖安装失败。" }
} finally { Pop-Location }
$hostConfig = Join-Path $dataDir "agent_config.json"
if (-not (Test-Path -LiteralPath $hostConfig)) {
    $configJSON = @{ model = ""; hostCommand = (Get-Command node).Source; hostArgs = @((Join-Path $repoRoot "agent-host\server.mjs")) } | ConvertTo-Json
    [IO.File]::WriteAllText($hostConfig, $configJSON, (New-Object Text.UTF8Encoding($false)))
}
if (Test-Path -LiteralPath $sessionFile) { Remove-Item -LiteralPath $sessionFile }

$backendCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $backendDirLiteral
`$env:CANVAS_BACKEND_ADDR = '127.0.0.1:18080'
`$env:CANVAS_BACKEND_DATA_DIR = $dataDirLiteral
`$env:GOCACHE = $(ConvertTo-PowerShellLiteral $goBuildCache)
`$env:GOMODCACHE = $(ConvertTo-PowerShellLiteral $goModuleCache)
`$env:GOTMPDIR = $(ConvertTo-PowerShellLiteral $goTempDir)
`$env:GOPATH = $(ConvertTo-PowerShellLiteral (Join-Path $repoRoot ".local\cache\go-path"))
`$env:CGO_ENABLED = '1'
Write-Host 'BeefTV后端：http://127.0.0.1:18080' -ForegroundColor Cyan
`$env:CANVAS_DEV_SESSION_FILE = $(ConvertTo-PowerShellLiteral $sessionFile)
& $(ConvertTo-PowerShellLiteral $serverBinary)
"@

$webCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $webDirLiteral
`$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:18080'
`$env:BEEFTV_DEV_SESSION_FILE = $(ConvertTo-PowerShellLiteral $sessionFile)
Write-Host 'BeefTV前端：http://localhost:13000' -ForegroundColor Cyan
bun node_modules/vite/bin/vite.js --host 127.0.0.1 --port 13000 --strictPort
"@

$backendEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($backendCommand))
$webEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($webCommand))
$backendProcess = Start-Process -FilePath $powerShellPath -WindowStyle Hidden -WorkingDirectory $backendDir -PassThru -ArgumentList @("-NoLogo", "-NoProfile", "-EncodedCommand", $backendEncoded) -RedirectStandardOutput (Join-Path $logDir "backend.stdout.log") -RedirectStandardError (Join-Path $logDir "backend.stderr.log")
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if (Test-Path -LiteralPath $sessionFile) { break }
    if ($backendProcess.HasExited) { throw "后端启动失败，请检查 $logDir。" }
    Start-Sleep -Milliseconds 500
}
if (-not (Test-Path -LiteralPath $sessionFile)) {
    & taskkill /PID $backendProcess.Id /T /F | Out-Null
    throw "等待后端开发会话超时，请检查 $logDir。"
}
$webProcess = Start-Process -FilePath $powerShellPath -WindowStyle Hidden -WorkingDirectory $webDir -PassThru -ArgumentList @("-NoLogo", "-NoProfile", "-EncodedCommand", $webEncoded) -RedirectStandardOutput (Join-Path $logDir "web.stdout.log") -RedirectStandardError (Join-Path $logDir "web.stderr.log")

@{ backendLauncherPid = $backendProcess.Id; webLauncherPid = $webProcess.Id } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir "local-processes.json")
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:13000/api/agent-clients' -TimeoutSec 2
        if ($health.code -eq 0 -and $health.data.cli.available) { $ready = $true; break }
    } catch { }
    if ($webProcess.HasExited -or $backendProcess.HasExited) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw "开发服务未就绪，请检查 $logDir；启动进程 ID 已记录在 local-processes.json。" }
Write-Host "前后端及 Agent CLI 已就绪，日志：$logDir" -ForegroundColor Green
Write-Host "后端启动进程 PID: $($backendProcess.Id)；前端启动进程 PID: $($webProcess.Id)"
Write-Host "访问 http://localhost:13000。"
