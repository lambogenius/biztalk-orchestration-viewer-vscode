[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$viewerRoot = $PSScriptRoot
$packageLockPath = Join-Path $viewerRoot 'package-lock.json'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js and npm are required to reinstall the BizTalk Orchestration Viewer dependencies.'
}

if (-not (Test-Path -LiteralPath $packageLockPath -PathType Leaf)) {
    throw "package-lock.json was not found at '$packageLockPath'."
}

Write-Host 'Removing the existing dependency installation and reinstalling from package-lock.json...'
& npm ci --prefix $viewerRoot
if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed with exit code $LASTEXITCODE."
}

Write-Host 'Dependencies reinstalled successfully.'
