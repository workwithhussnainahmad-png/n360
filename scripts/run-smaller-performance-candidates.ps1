param([Parameter(Mandatory=$true)][string]$ControlDirectory)
$ErrorActionPreference = 'Stop'
$experimentRoot = Split-Path $PSScriptRoot -Parent
Set-Location $experimentRoot
$experimentReference = Get-Content (Join-Path $ControlDirectory 'result.json') -Raw | ConvertFrom-Json
$experimentCompose = @('-f','docker-compose.yml','-f','docker-compose.k6.yml','-f','.codex/performance/config-archive/docker-compose.statement-observer.yml','-f','.codex/performance/config-archive/docker-compose.observer.yml','-f','.codex/performance/config-archive/docker-compose.native-warm.yml','-f','.codex/performance/config-archive/docker-compose.light-request.yml')
$experimentKept = @()
$experimentDecisions = @()
$experimentCandidates = @(
  @{label='short-fill-wait';file='.codex/performance/config-archive/docker-compose.short-fill.yml';flag='CACHE_FILL_WAIT_MS';value='2000'},
  @{label='narrow-notices';file='.codex/performance/config-archive/docker-compose.narrow-notices.yml';flag='PERFORMANCE_NARROW_NOTICES';value='1'},
  @{label='boolean-course';file='.codex/performance/config-archive/docker-compose.boolean-course.yml';flag='PERFORMANCE_BOOLEAN_COURSE';value='1'},
  @{label='bounded-daily-timetable';file='.codex/performance/config-archive/docker-compose.bounded-timetable.yml';flag='PERFORMANCE_BOUNDED_TIMETABLE';value='1'}
)
function Wait-ExperimentApps {
  $experimentDeadline = [DateTime]::UtcNow.AddSeconds(90)
  do {
    $experimentHealth = @(docker inspect lms-backend-app-1 nisaab360-app2 --format '{{.State.Health.Status}}')
    if ($experimentHealth.Count -eq 2 -and !($experimentHealth | Where-Object { $_ -ne 'healthy' })) { return }
    if ([DateTime]::UtcNow -ge $experimentDeadline) { throw 'Serving apps did not become healthy.' }
    Start-Sleep -Seconds 2
  } while ($true)
}
foreach ($experimentCandidate in $experimentCandidates) {
  $experimentArguments = $experimentCompose
  foreach ($experimentSaved in $experimentKept) { $experimentArguments += @('-f',$experimentSaved.file) }
  $experimentArguments += @('-f',$experimentCandidate.file)
  docker compose @experimentArguments up -d --no-build --no-deps app app2
  if ($LASTEXITCODE -ne 0) { throw 'Candidate deployment failed.' }
  Wait-ExperimentApps
  & "$PSScriptRoot/run-performance-experiment.ps1" -Label $experimentCandidate.label
  $experimentDirectory = Get-ChildItem 'test-results/experiments' -Directory | Where-Object { $_.Name.EndsWith('-'+$experimentCandidate.label) } | Sort-Object Name | Select-Object -Last 1
  $experimentRun = Join-Path $experimentDirectory.FullName 'run-1'
  $experimentAfter = Get-Content (Join-Path $experimentRun 'result.json') -Raw | ConvertFrom-Json
  $experimentSummary = (Get-Content (Join-Path $experimentRun 'summary.json') -Raw | ConvertFrom-Json).metrics
  # Three matched populated controls supply empirical ranges, not confidence intervals.
  $experimentGain = (($experimentReference.dashboardP95-$experimentAfter.dashboardP95) -gt 31.156325) -or (($experimentReference.httpP95-$experimentAfter.httpP95) -gt 147.36965) -or (($experimentReference.httpP99-$experimentAfter.httpP99) -gt 86.029615)
  $experimentRegression = (($experimentAfter.dashboardP95-$experimentReference.dashboardP95) -gt 31.156325) -or (($experimentAfter.httpP95-$experimentReference.httpP95) -gt 147.36965) -or (($experimentAfter.httpP99-$experimentReference.httpP99) -gt 86.029615) -or (($experimentReference.requestsPerSecond-$experimentAfter.requestsPerSecond) -gt 11.53342)
  $experimentCorrect = ($experimentAfter.failed -eq 0) -and ($experimentSummary.business_fail.passes -eq 0) -and ($experimentSummary.checks.fails -eq 0)
  $experimentKeep = $experimentGain -and !$experimentRegression -and $experimentCorrect
  $experimentDecision = @{label=$experimentCandidate.label;candidate=$experimentCandidate;before=$experimentReference;after=$experimentAfter;kept=$experimentKeep;runDirectory=$experimentRun;reason=if (!$experimentCorrect) {'HTTP/business/check failure'} elseif ($experimentRegression) {'Material percentile or throughput regression'} elseif (!$experimentGain) {'No gain beyond matched baseline range'} else {'Gain beyond range without material regression'}}
  $experimentDecisions += $experimentDecision
  if ($experimentKeep) { $experimentKept += $experimentCandidate; $experimentReference = $experimentAfter }
  $experimentState = @{reference=$experimentReference;kept=$experimentKept;decisions=$experimentDecisions;updatedAt=[DateTime]::UtcNow.ToString('o')}
  $experimentState | ConvertTo-Json -Depth 10 | Set-Content '.codex/last-smaller-candidate-state.json'
  $experimentState | ConvertTo-Json -Depth 10 | Set-Content 'docs/performance-smaller-candidate-decisions.json'
  Write-Output ('DECISION '+($experimentDecision | ConvertTo-Json -Depth 8 -Compress))
  node scripts/analyze-experiment-observer.mjs $experimentRun --brief
  node scripts/analyze-experiment-resources.mjs $experimentRun
  # Revert every unkept flag before proceeding, including the last candidate.
  $experimentArguments = $experimentCompose
  foreach ($experimentSaved in $experimentKept) { $experimentArguments += @('-f',$experimentSaved.file) }
  docker compose @experimentArguments up -d --no-build --no-deps app app2
  if ($LASTEXITCODE -ne 0) { throw 'Restore of selected flags failed.' }
  Wait-ExperimentApps
}
