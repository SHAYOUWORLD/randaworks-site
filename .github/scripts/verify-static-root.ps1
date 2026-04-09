$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$requiredFiles = @(
  "index.html",
  "404.html",
  "_headers",
  "robots.txt",
  "sitemap.xml",
  "worker.js",
  "assets/css/style.css",
  "assets/js/analytics.js",
  "about/index.html",
  "contact/index.html",
  "contact/thanks.html",
  "privacy/index.html",
  "terms/index.html",
  "support/index.html",
  "videos/index.html",
  "history-tools/index.html",
  "nihonshi-quiz/index.html",
  "wareki-converter/index.html",
  "busho-profile-search/index.html",
  "tools/holidays/index.html",
  "tools/nengo-game/index.html",
  "tools/trivia/index.html",
  "tools/graph/index.html",
  "tools/shiryo/index.html",
  "tools/kanji/index.html",
  "tools/furigana/index.html",
  "tools/weather/index.html",
  "games/index.html",
  "games/inga/index.html",
  "games/inga/play/index.html",
  "games/inga/privacy/index.html",
  "games/inga/support/index.html",
  "en/index.html",
  "en/about/index.html",
  "en/contact/index.html",
  "en/privacy/index.html",
  "en/terms/index.html",
  "en/support/index.html",
  "en/videos/index.html",
  "en/games/index.html",
  "en/games/inga/index.html",
  "en/games/inga/play/index.html",
  "en/games/inga/privacy/index.html",
  "en/games/inga/support/index.html"
)

$markers = @(
  @{ Path = "index.html"; Pattern = '<title>RandaWorks'; Message = "Missing expected marker in index.html" },
  @{ Path = "en/index.html"; Pattern = '<title>RandaWorks'; Message = "Missing expected marker in en/index.html" },
  @{ Path = "history-tools/index.html"; Pattern = 'data-page-type="history_tools_hub"'; Message = "Missing expected marker in history-tools/index.html" },
  @{ Path = "games/inga/index.html"; Pattern = '<title>日本史因果クロニクル'; Message = "Missing expected marker in games/inga/index.html" }
)

$missing = @()
foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    $missing += $relativePath
    continue
  }

  $item = Get-Item -LiteralPath $fullPath
  if ($item.PSIsContainer) {
    $missing += $relativePath
    continue
  }

  if ($item.Length -eq 0) {
    throw "Static file is empty: $relativePath"
  }
}

if ($missing.Count -gt 0) {
  throw ("Missing required static root files: " + ($missing -join ", "))
}

foreach ($marker in $markers) {
  $targetPath = Join-Path $repoRoot $marker.Path
  $content = Get-Content -LiteralPath $targetPath -Raw
  if ($content -notmatch $marker.Pattern) {
    throw $marker.Message
  }
}

Write-Host "verify-static-root: OK"
