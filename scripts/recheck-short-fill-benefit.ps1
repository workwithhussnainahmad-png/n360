$ErrorActionPreference = 'Stop'
$experimentRoot = Split-Path $PSScriptRoot -Parent
Set-Location $experimentRoot
$experimentState = Get-Content '.codex/last-smaller-candidate-state.json' -Raw | ConvertFrom-Json
$experimentOthers = @($experimentState.kept | Where-Object { $_.flag -ne 'CACHE_FILL_WAIT_MS' })
$experimentCompose = @('-f','docker-compose.yml','-f','docker-compose.k6.yml','-f','.codex/performance/config-archive/docker-compose.statement-observer.yml','-f','.codex/performance/config-archive/docker-compose.observer.yml','-f','.codex/performance/config-archive/docker-compose.native-warm.yml','-f','.codex/performance/config-archive/docker-compose.light-request.yml')
foreach ($experimentSaved in $experimentOthers) {
  if (!(Test-Path -LiteralPath $experimentSaved.file)) { $experimentSaved.file = '.codex/performance/config-archive/' + (Split-Path $experimentSaved.file -Leaf) }
  $experimentCompose += @('-f',$experimentSaved.file)
}
function Invoke-PairedLoad([string]$Label,[bool]$ShortWait) {
  $experimentArguments = $experimentCompose
  if ($ShortWait) { $experimentArguments += @('-f','.codex/performance/config-archive/docker-compose.short-fill.yml') }
  docker compose @experimentArguments up -d --no-build --no-deps app app2 | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Paired deployment failed.' }
  $experimentDeadline = [DateTime]::UtcNow.AddSeconds(90)
  do {
    $experimentHealth = @(docker inspect lms-backend-app-1 nisaab360-app2 --format '{{.State.Health.Status}}')
    if ($experimentHealth.Count -eq 2 -and !($experimentHealth | Where-Object { $_ -ne 'healthy' })) { break }
    if ([DateTime]::UtcNow -ge $experimentDeadline) { throw 'Serving apps not healthy.' }
    Start-Sleep -Seconds 2
  } while ($true)
  & "$PSScriptRoot/run-performance-experiment.ps1" -Label $Label | Out-Host
  $experimentDirectory = Get-ChildItem 'test-results/experiments' -Directory | Where-Object { $_.Name.EndsWith('-'+$Label) } | Sort-Object Name | Select-Object -Last 1
  $experimentRun = Join-Path $experimentDirectory.FullName 'run-1'
  node scripts/analyze-experiment-observer.mjs $experimentRun --brief | Out-Host
  node scripts/analyze-experiment-resources.mjs $experimentRun | Out-Host
  return @{runDirectory=$experimentRun;result=(Get-Content (Join-Path $experimentRun 'result.json') -Raw | ConvertFrom-Json);metrics=(Get-Content (Join-Path $experimentRun 'summary.json') -Raw | ConvertFrom-Json).metrics}
}
$experimentBefore = Invoke-PairedLoad 'short-wait-repeat-control' $false
$experimentAfter = Invoke-PairedLoad 'short-wait-repeat-on' $true
$experimentControl = $experimentBefore.result
$experimentCandidate = $experimentAfter.result
$experimentGain = (($experimentControl.dashboardP95-$experimentCandidate.dashboardP95) -gt 31.156325) -or (($experimentControl.httpP95-$experimentCandidate.httpP95) -gt 147.36965) -or (($experimentControl.httpP99-$experimentCandidate.httpP99) -gt 86.029615)
$experimentRegression = (($experimentCandidate.dashboardP95-$experimentControl.dashboardP95) -gt 31.156325) -or (($experimentCandidate.httpP95-$experimentControl.httpP95) -gt 147.36965) -or (($experimentCandidate.httpP99-$experimentControl.httpP99) -gt 86.029615) -or (($experimentControl.requestsPerSecond-$experimentCandidate.requestsPerSecond) -gt 11.53342)
$experimentKeep = $experimentGain -and !$experimentRegression -and ($experimentCandidate.failed -eq 0) -and ($experimentAfter.metrics.business_fail.passes -eq 0) -and ($experimentAfter.metrics.checks.fails -eq 0)
$experimentSelected = $experimentOthers
if ($experimentKeep) { $experimentSelected += @{label='short-fill-wait';flag='CACHE_FILL_WAIT_MS';file='.codex/performance/config-archive/docker-compose.short-fill.yml';value='2000'} }
$experimentFinal = @{kept=$experimentSelected;reference=if($experimentKeep){$experimentCandidate}else{$experimentControl};pairedShortWait=@{kept=$experimentKeep;before=$experimentControl;after=$experimentCandidate;controlDirectory=$experimentBefore.runDirectory;candidateDirectory=$experimentAfter.runDirectory};originalDecisions=$experimentState.decisions;updatedAt=[DateTime]::UtcNow.ToString('o')}
$experimentFinal | ConvertTo-Json -Depth 12 | Set-Content '.codex/final-smaller-candidate-state.json'
$experimentFinal | ConvertTo-Json -Depth 12 | Set-Content 'docs/performance-final-candidate-selection.json'
Write-Output ('PAIRED DECISION '+($experimentFinal.pairedShortWait | ConvertTo-Json -Depth 5 -Compress))
if (!$experimentKeep) {
  docker compose @experimentCompose up -d --no-build --no-deps app app2
  if ($LASTEXITCODE -ne 0) { throw 'Final short-wait revert failed.' }
}
