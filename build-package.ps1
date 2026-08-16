[CmdletBinding()]
param(
    [string]$OutputDirectory = 'artifacts'
)

$ErrorActionPreference = 'Stop'
$viewerRoot = $PSScriptRoot
$packageJsonPath = Join-Path $viewerRoot 'package.json'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js and npm are required to build the BizTalk Orchestration Viewer.'
}

if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
    throw "package.json was not found at '$packageJsonPath'."
}

$package = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$packageName = [string]$package.name
$packageVersion = [string]$package.version

if ([string]::IsNullOrWhiteSpace($packageName) -or [string]::IsNullOrWhiteSpace($packageVersion)) {
    throw 'package.json must contain a name and version.'
}

$resolvedOutputDirectory = [System.IO.Path]::GetFullPath(
    (Join-Path $viewerRoot $OutputDirectory)
)
$stagingDirectory = Join-Path $resolvedOutputDirectory "$packageName-$packageVersion"
$archivePath = "$stagingDirectory.zip"
$distDirectory = Join-Path $viewerRoot 'dist'

Write-Host 'Reinstalling dependencies from package-lock.json...'
& npm ci --prefix $viewerRoot
if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed with exit code $LASTEXITCODE."
}

Write-Host 'Building production files...'
& npm run build --prefix $viewerRoot
if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $distDirectory -PathType Container)) {
    throw "The build completed without creating '$distDirectory'."
}

New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null

if (Test-Path -LiteralPath $stagingDirectory) {
    Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
Copy-Item -Path (Join-Path $distDirectory '*') -Destination $stagingDirectory -Recurse

foreach ($documentationFile in @('README.md', 'LICENSE')) {
    $sourcePath = Join-Path $viewerRoot $documentationFile
    if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
        Copy-Item -LiteralPath $sourcePath -Destination $stagingDirectory
    }
}

Compress-Archive -Path (Join-Path $stagingDirectory '*') -DestinationPath $archivePath

Write-Host "Package created: $archivePath"
