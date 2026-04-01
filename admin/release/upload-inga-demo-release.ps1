param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$GameProjectRoot = "",
    [string]$Bucket = "randaworks-game-builds",
    [switch]$SkipWeb,
    [switch]$SkipWin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command not found: $Name"
    }
}

function Require-File {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required file not found: $Path"
    }
}

function Resolve-GameProjectRoot {
    param([string]$ConfiguredRoot)

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredRoot)) {
        return $ConfiguredRoot
    }

    if (-not [string]::IsNullOrWhiteSpace($env:RANDA_INGA_PROJECT_ROOT)) {
        return $env:RANDA_INGA_PROJECT_ROOT
    }

    $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $siblingRoot = Join-Path (Split-Path -Parent $repoRoot) "chie-game-go"
    if (Test-Path -LiteralPath $siblingRoot -PathType Container) {
        return $siblingRoot
    }

    throw "GameProjectRoot not found. Pass -GameProjectRoot or set RANDA_INGA_PROJECT_ROOT."
}

Require-Command "gcloud"

$GameProjectRoot = Resolve-GameProjectRoot -ConfiguredRoot $GameProjectRoot

$activeAccount = (& gcloud auth list --filter=status:ACTIVE --format="value(account)").Trim()
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
    throw "No active gcloud account. Run 'gcloud auth login' first."
}

$officialWebStage = Join-Path $GameProjectRoot "build\release\official_web_demo\stage"
$officialWinRoot = Join-Path $GameProjectRoot "build\release\official_win"
$winZip = Join-Path $officialWinRoot ("IngaChronicle_Demo_v{0}_win.zip" -f $Version)
$webFiles = @(
    Join-Path $officialWebStage "index.wasm"
    Join-Path $officialWebStage "index.pck.part000"
    Join-Path $officialWebStage "index.pck.part001"
)

if (-not $SkipWin) {
    Require-File $winZip
}

if (-not $SkipWeb) {
    foreach ($file in $webFiles) {
        Require-File $file
    }
}

$winTarget = "gs://$Bucket/inga-demo/v$Version/"
$webTarget = "gs://$Bucket/inga-demo/$Version/"
$winObject = "{0}IngaChronicle_Demo_v{1}_win.zip" -f $winTarget, $Version

Write-Host "Active gcloud account: $activeAccount"
Write-Host "Version             : $Version"

if (-not $SkipWin) {
    Write-Host "Uploading Windows ZIP..."
    & gcloud storage cp $winZip $winObject
    if ($LASTEXITCODE -ne 0) {
        throw "Windows ZIP upload failed."
    }
}

if (-not $SkipWeb) {
    Write-Host "Uploading Web large assets..."
    & gcloud storage cp @webFiles $webTarget
    if ($LASTEXITCODE -ne 0) {
        throw "Web asset upload failed."
    }
}

Write-Host ""
Write-Host "Uploaded objects:"
if (-not $SkipWin) {
    & gcloud storage ls $winObject
}
if (-not $SkipWeb) {
    & gcloud storage ls ($webTarget + "*")
}
