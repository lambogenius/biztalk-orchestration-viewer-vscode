[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$viewerRoot = $PSScriptRoot
$packageLockPath = Join-Path $viewerRoot 'package-lock.json'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js and npm are required to run the BizTalk Orchestration Viewer.'
}

if (-not (Test-Path -LiteralPath (Join-Path $viewerRoot 'node_modules'))) {
    if (Test-Path -LiteralPath $packageLockPath -PathType Leaf) {
        & npm ci --prefix $viewerRoot
    } else {
        & npm install --prefix $viewerRoot
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Dependency install failed with exit code $LASTEXITCODE."
    }
}

& npm run dev --prefix $viewerRoot
exit $LASTEXITCODE
