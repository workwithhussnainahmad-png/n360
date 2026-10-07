$ErrorActionPreference='Stop'
$experimentRoot=Split-Path $PSScriptRoot -Parent
Set-Location $experimentRoot
$experimentSelection=Get-Content '.codex/final-replica-selection.json' -Raw | ConvertFrom-Json
$experimentAppCount=[int]$experimentSelection.appCount
foreach($experimentScenario in @('load','spike','stress')) {
  & "$PSScriptRoot/run-performance-experiment.ps1" -Label ('final-production-'+$experimentScenario) -Scenario $experimentScenario -AppCount $experimentAppCount -NoStatementStats -SkipCaddyArchive
  $experimentDirectory=Get-ChildItem 'test-results/experiments' -Directory | Where-Object { $_.Name.EndsWith('-final-production-'+$experimentScenario) } | Sort-Object Name | Select-Object -Last 1
  node scripts/analyze-experiment-resources.mjs (Join-Path $experimentDirectory.FullName 'run-1')
  # Same recovery policy, no cache flushing, prewarming or test reduction.
  if($experimentScenario -ne 'stress') { Start-Sleep -Seconds 60 }
}
