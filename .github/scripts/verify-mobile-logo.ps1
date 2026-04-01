$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$rootHome = Join-Path $repoRoot "index.html"
$enHome = Join-Path $repoRoot "en\index.html"
$stylePath = Join-Path $repoRoot "assets\css\style.css"

function Assert-Contains {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Message
  )

  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -notmatch $Pattern) {
    throw $Message
  }
}

foreach ($homePath in @($rootHome, $enHome)) {
  if (-not (Test-Path -LiteralPath $homePath)) {
    throw "Home page not found: $homePath"
  }
  Assert-Contains -Path $homePath -Pattern '<body[^>]*class="[^"]*\bhome-page\b' -Message "Missing body.home-page in $homePath"
}

$styleContent = Get-Content -LiteralPath $stylePath -Raw
$mobileRulePattern = '@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.home-page\s+\.nav\s+\.brand\s*\{\s*display:\s*none;\s*\}'
if ($styleContent -notmatch $mobileRulePattern) {
  throw "Missing mobile logo rule for .home-page .nav .brand in assets/css/style.css"
}

$allowedHomePages = @(
  (Resolve-Path -LiteralPath $rootHome).Path,
  (Resolve-Path -LiteralPath $enHome).Path
)

$htmlFiles = Get-ChildItem -Path $repoRoot -Recurse -File -Filter *.html
$unexpectedHomePages = @()

foreach ($file in $htmlFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  if ($content -match '<body[^>]*class="[^"]*\bhome-page\b' -and $allowedHomePages -notcontains $file.FullName) {
    $unexpectedHomePages += $file.FullName
  }
}

if ($unexpectedHomePages.Count -gt 0) {
  throw ("Unexpected home-page class found in: " + ($unexpectedHomePages -join ", "))
}

Write-Host "verify-mobile-logo: OK"
