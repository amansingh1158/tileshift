// Publishes the PWA in app/ to GitHub Pages via an orphan `gh-pages` branch.
// URL: https://<owner>.github.io/<repo>/  (e.g. https://amansingh1158.github.io/tileshift/)
$ErrorActionPreference = 'Stop'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$pages = Join-Path $env:TEMP 'tileshift-gh-pages'
$remote = 'origin'

git -C $repo remote -v | Out-Null
if (-not $?) { throw 'git not available' }

if (Test-Path $pages) {
  git -C $repo worktree remove $pages --force 2>$null
  Remove-Item $pages -Recurse -Force
}
# Rebuild the gh-pages branch from app/ contents.
git -C $repo worktree add --orphan -B gh-pages $pages | Out-Null
if (-not $?) { throw 'could not create gh-pages worktree' }

# Strip the placeholder commit the orphan worktree starts with and copy app/ in.
git -C $pages add -A; git -C $pages commit -m 'chore(pages): publish empty branch' --allow-empty 2>$null | Out-Null
Get-ChildItem $pages | Remove-Item -Recurse -Force
Copy-Item (Join-Path $repo 'app\*') $pages -Recurse -Force
if (Test-Path (Join-Path $pages 'delete-account.html')) {
  Write-Output 'delete-account.html copied OK'
} else {
  throw 'copy failed: delete-account.html missing'
}

git -C $pages add -A
git -C $pages commit -m "pages: publish web app (tileshift-v23)" | Out-Null
if (-not $?) { throw 'commit failed' }
git -C $pages push --force $remote gh-pages
if (-not $?) { throw 'push failed' }

git -C $repo worktree remove $pages --force
Write-Output 'Published to GitHub Pages: https://amansingh1158.github.io/tileshift/'