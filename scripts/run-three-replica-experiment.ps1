$ErrorActionPreference = 'Stop'
$experimentRoot = Split-Path $PSScriptRoot -Parent
Set-Location $experimentRoot
$experimentState = Get-Content '.codex/final-smaller-candidate-state.json' -Raw | ConvertFrom-Json
$experimentCompose = @('-f','docker-compose.yml','-f','docker-compose.k6.yml','-f','.codex/performance/config-archive/docker-compose.statement-observer.yml','-f','.codex/performance/config-archive/docker-compose.observer.yml','-f','.codex/performance/config-archive/docker-compose.native-warm.yml','-f','.codex/performance/config-archive/docker-compose.light-request.yml')
$experimentFlagLines = @('services:','  app3:','    environment:')
foreach ($experimentSaved in $experimentState.kept) {
  $experimentSavedFile = $experimentSaved.file
  if (!(Test-Path -LiteralPath $experimentSavedFile)) { $experimentSavedFile = '.codex/performance/config-archive/' + (Split-Path $experimentSavedFile -Leaf) }
  $experimentCompose += @('-f',$experimentSavedFile)
  $experimentFlagLines += ('      '+$experimentSaved.flag+': "'+$experimentSaved.value+'"')
}
if (!$experimentState.kept.Count) { $experimentFlagLines += '      CACHE_FILL_WAIT_MS: "10000"' }
$experimentFlagLines | Set-Content '.codex/performance/config-archive/docker-compose.three-app-kept-flags.yml'
New-Item -ItemType Directory -Path '.codex/performance-observer/app3' -Force | Out-Null
$experimentThreeCompose = $experimentCompose + @('-f','.codex/performance/config-archive/docker-compose.three-app.yml','-f','.codex/performance/config-archive/docker-compose.three-app-kept-flags.yml')
docker compose @experimentThreeCompose up -d --no-build --no-deps app3 caddy
if ($LASTEXITCODE -ne 0) { throw 'Three-replica deployment failed.' }
$experimentDeadline = [DateTime]::UtcNow.AddSeconds(90)
do {
  $experimentHealth = @(docker inspect lms-backend-app-1 nisaab360-app2 nisaab360-app3 --format '{{.State.Health.Status}}')
  if ($experimentHealth.Count -eq 3 -and !($experimentHealth | Where-Object { $_ -ne 'healthy' })) { break }
  if ([DateTime]::UtcNow -ge $experimentDeadline) { throw 'Three replicas not healthy.' }
  Start-Sleep -Seconds 2
} while ($true)
& "$PSScriptRoot/run-performance-experiment.ps1" -Label 'three-replica-comparison' -AppCount 3
$experimentDirectory = Get-ChildItem 'test-results/experiments' -Directory | Where-Object { $_.Name.EndsWith('-three-replica-comparison') } | Sort-Object Name | Select-Object -Last 1
$experimentRun = Join-Path $experimentDirectory.FullName 'run-1'
$experimentAfter = Get-Content (Join-Path $experimentRun 'result.json') -Raw | ConvertFrom-Json
$experimentMetrics = (Get-Content (Join-Path $experimentRun 'summary.json') -Raw | ConvertFrom-Json).metrics
$experimentBefore = $experimentState.reference
$experimentGain = (($experimentBefore.dashboardP95-$experimentAfter.dashboardP95) -gt 31.156325) -or (($experimentBefore.httpP95-$experimentAfter.httpP95) -gt 147.36965) -or (($experimentBefore.httpP99-$experimentAfter.httpP99) -gt 86.029615)
$experimentRegression = (($experimentAfter.dashboardP95-$experimentBefore.dashboardP95) -gt 31.156325) -or (($experimentAfter.httpP95-$experimentBefore.httpP95) -gt 147.36965) -or (($experimentAfter.httpP99-$experimentBefore.httpP99) -gt 86.029615) -or (($experimentBefore.requestsPerSecond-$experimentAfter.requestsPerSecond) -gt 11.53342)
$experimentKeep = $experimentGain -and !$experimentRegression -and ($experimentAfter.failed -eq 0) -and ($experimentMetrics.business_fail.passes -eq 0) -and ($experimentMetrics.checks.fails -eq 0)
$experimentDecision = @{kept=$experimentKeep;before=$experimentBefore;after=$experimentAfter;runDirectory=$experimentRun;appCount=if($experimentKeep){3}else{2};keptFlags=$experimentState.kept}
$experimentDecision | ConvertTo-Json -Depth 10 | Set-Content '.codex/final-replica-selection.json'
$experimentDecision | ConvertTo-Json -Depth 10 | Set-Content 'docs/performance-replica-selection.json'
Write-Output ('REPLICA DECISION '+($experimentDecision | ConvertTo-Json -Depth 8 -Compress))
node scripts/analyze-experiment-observer.mjs $experimentRun --brief
node scripts/analyze-experiment-resources.mjs $experimentRun
if (!$experimentKeep) {
  docker compose @experimentCompose up -d --no-build --no-deps caddy
  if ($LASTEXITCODE -ne 0) { throw 'Two-replica proxy restore failed.' }
  docker stop nisaab360-app3
  docker rm nisaab360-app3
}
