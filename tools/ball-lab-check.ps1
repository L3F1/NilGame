param([Parameter(Mandatory=$true)][string]$Godot)
$ErrorActionPreference = 'Stop'
$taskProject = Join-Path (Split-Path $PSScriptRoot -Parent) 'experiments\godot'
$taskResults = Join-Path $taskProject 'results\ball-lab'
New-Item -ItemType Directory -Force -Path $taskResults | Out-Null
$taskStarted = Get-Date
$taskStderr = Join-Path $taskResults 'stderr.log'
$taskStdout = Join-Path $taskResults 'stdout.log'
$taskProcess = Start-Process -FilePath (Resolve-Path -LiteralPath $Godot).Path `
    -ArgumentList @('--path', ('"' + $taskProject + '"'), 'res://ball_lab.tscn', '--', '--ball-check') `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr
$taskHandle = $taskProcess.Handle
if (!$taskProcess.WaitForExit(45000)) {
    $taskProcess.Kill()
    throw 'Ball lab timed out after 45 seconds.'
}
Get-Content -LiteralPath $taskStdout
$taskErrors = Get-Content -LiteralPath $taskStderr -Raw
if ($taskErrors -match '(?m)(SHADER ERROR|SCRIPT ERROR|ERROR):' -or $taskProcess.ExitCode -ne 0) {
    Write-Output $taskErrors
    throw 'Ball lab failed.'
}
$taskReport = Join-Path $taskResults 'report.json'
if (!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStarted) {
    throw 'Ball lab did not produce a fresh report.'
}
$taskChecks = Get-Content -LiteralPath $taskReport -Raw | ConvertFrom-Json
if (@($taskChecks | Where-Object { !$_.ok }).Count -gt 0) { throw 'Ball lab reported failed checks.' }
Write-Output ('Validated native ball editor: ' + $taskReport)
