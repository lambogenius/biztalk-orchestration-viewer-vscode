[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$viewerRoot = $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js and npm are required to run the BizTalk Orchestration Viewer.'
}

if (-not (Test-Path -LiteralPath (Join-Path $viewerRoot 'node_modules'))) {
    & npm install --prefix $viewerRoot
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE."
    }
}

& npm run dev --prefix $viewerRoot
exit $LASTEXITCODE
