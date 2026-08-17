#!/usr/bin/env pwsh
# sync.ps1 — install this repository's owned assets into the DeepSeek Harness home.
# -----------------------------------------------------------------------------
# <#
# .SYNOPSIS
#   Mirror repo-owned assets into the harness home (${DSH_HOME:-$HOME/.dsh}).
# .DESCRIPTION
#   presets: copies presets/<id>/ into <dshHome>/.agent-presets/<id>/ so the
#   harness roster can mount them. Skills, MCP fragments, and plugin sources
#   are wired through compositions instead (see README.md); this script is
#   extended when those need direct install paths.
# .PARAMETER What
#   Asset kind to sync. Currently only 'presets' is implemented.
# .PARAMETER Preset
#   Optional preset ids to sync (repeatable, e.g. -Preset architect -Preset tester).
#   Omit to sync every preset directory in presets/.
# .PARAMETER DryRun
#   Print what would be copied without touching the harness home.
# .PARAMETER RepoRoot
#   Repository root; defaults to the parent of this script's directory.
# .PARAMETER DshHome
#   Harness home; defaults to $env:DSH_HOME or $HOME/.dsh.
# .EXAMPLE
#   ./scripts/sync.ps1 -DryRun
#   ./scripts/sync.ps1 -Preset architect -Preset tester
#   ./scripts/sync.ps1
# #>
param(
  [ValidateSet('presets')]
  [string]$What = 'presets',
  [string[]]$Preset = @(),
  [switch]$DryRun,
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' })
)

$ErrorActionPreference = 'Stop'

# Preset ids that the deployment reserves: the CLI injects the SHIPPED preset
# root ahead of the user root, and discovery lets an earlier root win a
# duplicate id — so a synced copy with one of these ids is shadowed and never
# mounts. To make a repo-owned divergence authoritative, rename the directory
# to a distinct id (e.g. presets/my-cordis/) before syncing.
$ShippedPresetIds = @('code', 'cordis', 'minimal', 'standard')

function Sync-Presets {
  $presetsDir = Join-Path $RepoRoot 'presets'
  if (-not (Test-Path $presetsDir)) {
    Write-Error "presets directory not found: $presetsDir"
  }
  $userRoot = Join-Path $DshHome '.agent-presets'
  $copied = @(); $shadowed = @(); $skipped = @()

  foreach ($dir in Get-ChildItem $presetsDir -Directory) {
    $id = $dir.Name
    if ($Preset.Count -gt 0 -and $Preset -notcontains $id) {
      continue
    }
    $composition = Join-Path $dir.FullName 'agent.cordis.yml'
    if (-not (Test-Path $composition)) {
      $skipped += "$id (no agent.cordis.yml)"
      continue
    }
    $target = Join-Path $userRoot $id
    if ($ShippedPresetIds -contains $id) {
      $shadowed += $id
      Write-Warning "preset '$id' matches a shipped id and would be shadowed by the deployment's copy (shipped root wins). Rename presets/$id to a distinct id to make it mount."
    }
    if ($DryRun) {
      Write-Host "[dry-run] would copy presets/$id -> $target"
      $copied += $id
      continue
    }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -Path (Join-Path $dir.FullName '*') -Destination $target -Recurse -Force
    $copied += $id
  }

  Write-Host ''
  Write-Host "synced presets: $($copied -join ', ') $($DryRun ? '(dry-run)' : '')" -ForegroundColor Green
  if ($shadowed.Count -gt 0) {
    Write-Host "shadowed by shipped root (id reserved by deployment): $($shadowed -join ', ')" -ForegroundColor Yellow
  }
  if ($skipped.Count -gt 0) {
    Write-Host "skipped: $($skipped -join '; ')" -ForegroundColor Yellow
  }
}

switch ($What) {
  'presets' { Sync-Presets }
}
