param(
    [Parameter(Mandatory=$true)][string]$Godot,
    [ValidateSet('gl_compatibility', 'forward_plus')][string]$Backend = 'gl_compatibility'
)
# A real GPU window, hidden for automation. Headless Godot uses a dummy renderer
# and cannot establish that the shader actually renders.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskProject = Join-Path $taskRoot 'experiments\godot'
$taskResults = Join-Path $taskProject 'results'
New-Item -ItemType Directory -Force -Path $taskResults | Out-Null
$taskStdout = Join-Path $taskResults ($Backend + '-stdout.log')
$taskStderr = Join-Path $taskResults ($Backend + '-stderr.log')
$taskStarted = Get-Date
$taskProcess = Start-Process -FilePath (Resolve-Path -LiteralPath $Godot).Path `
    -ArgumentList @('--path', ('"' + $taskProject + '"'), '--rendering-method', $Backend, '--', '--benchmark') `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr
$taskHandle = $taskProcess.Handle # Retain the handle so PowerShell can read ExitCode after exit.
if (!$taskProcess.WaitForExit(60000)) {
    $taskProcess.Kill()
    throw 'Godot benchmark timed out after 60 seconds.'
}
$taskErrors = Get-Content -LiteralPath $taskStderr -Raw
Get-Content -LiteralPath $taskStdout -Tail 10
if ($taskErrors -match '(?m)(SHADER ERROR|SCRIPT ERROR|ERROR):' -or $taskProcess.ExitCode -ne 0) {
    Write-Output $taskErrors
    throw 'Godot failed; captures/timings from this run are invalid.'
}
$taskReport = Join-Path $taskResults ($Backend + '\report.json')
if (!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStarted) {
    throw 'Godot did not produce a fresh report.'
}
Write-Output ('Validated native run: ' + $taskReport)
