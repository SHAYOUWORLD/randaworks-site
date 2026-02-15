$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) {
    throw $Message
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$indexPath = Join-Path $repoRoot "index.html"
$cssPath = Join-Path $repoRoot "assets/css/style.css"

$indexContent = Get-Content -Path $indexPath -Raw -Encoding UTF8
$cssContent = Get-Content -Path $cssPath -Raw -Encoding UTF8

Assert-True `
  -Condition ([regex]::IsMatch($indexContent, '<body class="home-page">')) `
  -Message "index.html に <body class=""home-page""> が見つかりません。"

$mobileRulePattern = '(?s)@media\s*\(max-width:\s*480px\)\s*\{.*?\.home-page\s+\.nav\s+\.brand\s*\{\s*display:\s*none;\s*\}'
Assert-True `
  -Condition ([regex]::IsMatch($cssContent, $mobileRulePattern)) `
  -Message "assets/css/style.css の 480px メディアクエリ内に .home-page .nav .brand { display: none; } が見つかりません。"

$otherHtmlFiles = Get-ChildItem -Path $repoRoot -Recurse -File -Filter *.html | Where-Object { $_.FullName -ne $indexPath }
$homePageLeaks = @()
foreach ($file in $otherHtmlFiles) {
  $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
  if ($content -match '<body class="home-page">') {
    $homePageLeaks += $file.FullName
  }
}

Assert-True `
  -Condition ($homePageLeaks.Count -eq 0) `
  -Message ("home-page クラスが index.html 以外に含まれています:`n" + ($homePageLeaks -join "`n"))

Write-Host "verify-mobile-logo: OK"
