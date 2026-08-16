[CmdletBinding()]
param(
    [string]$CodeCommand = 'code'
)

$ErrorActionPreference = 'Stop'
$viewerRoot = $PSScriptRoot
$extensionId = 'lambogenius.biztalk-orchestration-viewer'
$vsixPath = Join-Path $viewerRoot 'artifacts\biztalk-orchestration-viewer.vsix'

foreach ($command in @('npm', $CodeCommand)) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found on PATH."
    }
}

Write-Host 'Installing locked npm dependencies...'
& npm ci --prefix $viewerRoot
if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed with exit code $LASTEXITCODE."
}

Write-Host 'Building and packaging the VS Code extension...'
& npm run package:vsix --prefix $viewerRoot
if ($LASTEXITCODE -ne 0) {
    throw "VSIX packaging failed with exit code $LASTEXITCODE."
}

$installedExtensions = & $CodeCommand --list-extensions
if ($LASTEXITCODE -ne 0) {
    throw "Unable to list installed VS Code extensions (exit code $LASTEXITCODE)."
}

if ($installedExtensions -contains $extensionId) {
    Write-Host "Uninstalling $extensionId..."
    & $CodeCommand --uninstall-extension $extensionId
    if ($LASTEXITCODE -ne 0) {
        throw "Extension uninstall failed with exit code $LASTEXITCODE."
    }
}

Write-Host "Installing $vsixPath..."
& $CodeCommand --install-extension $vsixPath --force
if ($LASTEXITCODE -ne 0) {
    throw "Extension install failed with exit code $LASTEXITCODE."
}

Write-Host 'Extension installed. Reload VS Code, then run BizTalk: Open Orchestration Viewer from the Command Palette.'
