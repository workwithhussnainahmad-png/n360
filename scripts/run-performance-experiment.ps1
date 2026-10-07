param(
  [string]$Label = 'baseline',
  [int]$Repeats = 1,
  [string]$Scenario = 'load',
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$BaseUrls = '',
  [string]$AffinityMask = 'C0',
  [int]$Vus = 2000,
  [string]$Hold = '5m',
  [int]$ArrivalRate = 400,
  [int]$AppCount = 2,
  [switch]$NoStatementStats,
  [switch]$SkipCaddyArchive
)
$ErrorActionPreference = 'Stop'
$experimentRoot = Split-Path $PSScriptRoot -Parent
$experimentStamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
$experimentDirectory = Join-Path $experimentRoot "test-results/experiments/$experimentStamp-$Label"
New-Item -ItemType Directory -Path $experimentDirectory -Force | Out-Null
$env:TEST_ROLE = 'MIXED'
$env:BASE_URL = $BaseUrl
$env:BASE_URLS = $BaseUrls
$env:PERFORMANCE_APP3 = if ($AppCount -eq 3) { '1' } else { '0' }
$experimentAppNames = @('lms-backend-app-1','nisaab360-app2')
if ($AppCount -eq 3) { $experimentAppNames += 'nisaab360-app3' }
$experimentBinary = Join-Path $experimentRoot 'k6/bin/k6.exe'
if (!(Test-Path -LiteralPath $experimentBinary)) { throw 'Native k6 executable missing.' }
$experimentCounts = (Get-Content (Join-Path $experimentRoot 'k6/tokens.json') -Raw | ConvertFrom-Json).tokens
if (($experimentCounts | Where-Object roleHint -in @('STUDENT','STAFF')).Count -ne 2500) { throw 'Expected 2500 MIXED tokens.' }
$experimentFingerprint = @{
  label=$Label; scenario=$Scenario; vus=$Vus; hold=$Hold; baseUrl=$BaseUrl; baseUrls=$BaseUrls; arrivalRate=$ArrivalRate
  k6AffinityMask=$AffinityMask; wslConfig=[IO.File]::ReadAllText("$env:USERPROFILE/.wslconfig")
  exclusiveWslAffinity=$false; isolationLimitation='vmmemWSL affinity assignment returned Access is denied; processors=4 does not select host logical CPUs.'
  statementStatsCaptured=(!$NoStatementStats); caddyArchiveCaptured=(!$SkipCaddyArchive)
  testSourceSha256=@{config=(Get-FileHash 'k6/config.js' -Algorithm SHA256).Hash;scenario=(Get-FileHash ('k6/scripts/'+$Scenario+'.js') -Algorithm SHA256).Hash;tokens=(Get-FileHash 'k6/tokens.json' -Algorithm SHA256).Hash}
  appCount=$AppCount; images=(docker inspect @experimentAppNames --format '{{.Image}}')
  startedAt=(Get-Date).ToUniversalTime().ToString('o')
}
$experimentFingerprint.runtime = @{}
foreach ($experimentApp in $experimentAppNames) {
  $experimentContainer = (docker inspect $experimentApp | ConvertFrom-Json)[0]
  $experimentAllowedEnvironment = @{}
  foreach ($experimentEntry in $experimentContainer.Config.Env) {
    $experimentPair = $experimentEntry.Split('=',2)
    if ($experimentPair[0] -in @('HOT_PATH_LANE','HOT_PATH_NATIVE_WARM','HOT_PATH_LIGHT_REQUEST','HOT_PATH_ENCODED_BODY','DB_PREPARED_STATEMENTS','CACHE_FILL_WAIT_MS','PERFORMANCE_NARROW_NOTICES','PERFORMANCE_BOOLEAN_COURSE','PERFORMANCE_BOUNDED_TIMETABLE','PERFORMANCE_OBSERVER','NODE_OPTIONS','DB_POOL_MAX','KEEP_ALIVE_TIMEOUT','NODE_ENV')) {
      $experimentAllowedEnvironment[$experimentPair[0]] = $experimentPair[1]
    }
  }
  $experimentFingerprint.runtime[$experimentApp] = $experimentAllowedEnvironment
}
$experimentFingerprint | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $experimentDirectory 'environment.json')
for ($experimentRun = 1; $experimentRun -le $Repeats; $experimentRun++) {
  $experimentRunDirectory = Join-Path $experimentDirectory "run-$experimentRun"
  New-Item -ItemType Directory -Path $experimentRunDirectory | Out-Null
  $experimentSummary = Join-Path $experimentRunDirectory 'summary.json'
  if (!$NoStatementStats) { docker exec lms-backend-postgres-1 psql -U app -d app -t -A -c 'SELECT json_agg(s) FROM (SELECT queryid, calls, plans, total_plan_time, total_exec_time, mean_exec_time, max_exec_time, rows, shared_blks_hit, shared_blks_read, query FROM pg_stat_statements WHERE query ILIKE ''select%'') s;' | Out-File (Join-Path $experimentRunDirectory 'pg-stat-before.json') }
  $experimentArguments = @('run','--quiet','--summary-export',('"'+$experimentSummary+'"'),'-e',('BASE_URL='+$BaseUrl),'-e','TEST_ROLE=MIXED','-e',('TARGET_VUS='+$Vus),'-e',('MAX_VUS='+$Vus),'-e',('SPIKE_VUS='+$Vus),'-e',('DURATION='+$Hold),'-e',('ARRIVAL_RATE='+$ArrivalRate),'-e','INCLUDE_UNREAD=false',('scripts/'+$Scenario+'.js'))
  $experimentArguments = $experimentArguments[0..($experimentArguments.Length-2)] + @('-e',('BASE_URLS='+$BaseUrls),('scripts/'+$Scenario+'.js'))
  if ($Scenario -in @('load','stress')) {
    $experimentThink = if ($Scenario -eq 'load') { '1.5' } else { '0.5' }
    $experimentArguments = $experimentArguments[0..($experimentArguments.Length-2)] + @('-e',('THINK_SEC='+$experimentThink),('scripts/'+$Scenario+'.js'))
  }
  $experimentStarted = (Get-Date).ToUniversalTime().ToString('o')
  $experimentProcess = Start-Process -FilePath $experimentBinary -ArgumentList $experimentArguments -WorkingDirectory (Join-Path $experimentRoot 'k6') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $experimentRunDirectory 'stdout.txt') -RedirectStandardError (Join-Path $experimentRunDirectory 'stderr.txt')
  $null = $experimentProcess.Handle
  $experimentProcess.ProcessorAffinity = [IntPtr]([Convert]::ToInt64($AffinityMask,16))
  @{pid=$experimentProcess.Id; affinity=$experimentProcess.ProcessorAffinity.ToInt64(); startedAt=$experimentStarted} | ConvertTo-Json | Set-Content (Join-Path $experimentRunDirectory 'generator.json')
  Write-Output "Started $Label run $experimentRun/$Repeats, k6 PID $($experimentProcess.Id), affinity $AffinityMask. Artifacts: $experimentRunDirectory"
  # Direct Engine stream retains UTC timestamps at its one-second cadence.
  $experimentStats = Start-Process -FilePath 'node' -ArgumentList @('scripts/collect-docker-stats.mjs',('"'+(Join-Path $experimentRunDirectory 'docker-engine-stats.jsonl')+'"')) -WorkingDirectory $experimentRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $experimentRunDirectory 'docker-stats-collector.txt') -RedirectStandardError (Join-Path $experimentRunDirectory 'docker-stats-errors.txt')
  try {
    $experimentPreviousCpu = 0
    $experimentPreviousSample = [Diagnostics.Stopwatch]::StartNew()
    while (!$experimentProcess.WaitForExit(1000)) {
      $experimentCurrentProcess = Get-Process -Id $experimentProcess.Id -ErrorAction SilentlyContinue
      if ($experimentCurrentProcess) {
        $experimentCpu = $experimentCurrentProcess.TotalProcessorTime.TotalMilliseconds
        @{time=(Get-Date).ToUniversalTime().ToString('o');cpuPercent=100*($experimentCpu-$experimentPreviousCpu)/$experimentPreviousSample.Elapsed.TotalMilliseconds;workingSet=$experimentCurrentProcess.WorkingSet64} | ConvertTo-Json -Compress | Add-Content (Join-Path $experimentRunDirectory 'generator-stats.jsonl')
        $experimentPreviousCpu = $experimentCpu
        $experimentPreviousSample.Restart()
      }
    }
    $experimentProcess.WaitForExit()
    $experimentFinished = (Get-Date).ToUniversalTime().ToString('o')
    @{startedAt=$experimentStarted;finishedAt=$experimentFinished;exitCode=$experimentProcess.ExitCode} | ConvertTo-Json | Set-Content (Join-Path $experimentRunDirectory 'run.json')
    $experimentLogPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker logs --timestamps --since $experimentStarted lms-backend-app-1 2>&1 | Out-File (Join-Path $experimentRunDirectory 'app.log')
    docker logs --timestamps --since $experimentStarted nisaab360-app2 2>&1 | Out-File (Join-Path $experimentRunDirectory 'app2.log')
    if ($AppCount -eq 3) { docker logs --timestamps --since $experimentStarted nisaab360-app3 2>&1 | Out-File (Join-Path $experimentRunDirectory 'app3.log') }
    if (!$NoStatementStats) { docker exec lms-backend-postgres-1 psql -U app -d app -t -A -c 'SELECT json_agg(s) FROM (SELECT queryid, calls, plans, total_plan_time, total_exec_time, mean_exec_time, max_exec_time, rows, shared_blks_hit, shared_blks_read, query FROM pg_stat_statements WHERE query ILIKE ''select%'' ORDER BY total_exec_time DESC) s;' | Out-File (Join-Path $experimentRunDirectory 'pg-stat-statements.json') }
    $ErrorActionPreference = $experimentLogPreference
    if (!$SkipCaddyArchive) {
      $experimentArchive = Join-Path $experimentRunDirectory 'caddy-access'
      New-Item -ItemType Directory -Path $experimentArchive -Force | Out-Null
      docker cp 'lms-backend-caddy-1:/performance-observer/.' $experimentArchive 2>&1 | Out-File (Join-Path $experimentRunDirectory 'caddy-archive.txt')
    }
    if (!(Test-Path -LiteralPath $experimentSummary)) { throw 'k6 produced no summary; inspect stderr.txt.' }
    $experimentMetrics = (Get-Content $experimentSummary -Raw | ConvertFrom-Json).metrics
    $experimentRow = [ordered]@{label=$Label;run=$experimentRun;dashboardP95=$experimentMetrics.dashboard_ms.'p(95)';httpP95=$experimentMetrics.http_req_duration.'p(95)';httpP99=$experimentMetrics.http_req_duration.'p(99)';max=$experimentMetrics.http_req_duration.max;requestsPerSecond=$experimentMetrics.http_reqs.rate;failed=$experimentMetrics.http_req_failed.passes;exitCode=$experimentProcess.ExitCode}
    $experimentRow | ConvertTo-Json | Set-Content (Join-Path $experimentRunDirectory 'result.json')
    Write-Output ($experimentRow | ConvertTo-Json -Compress)
  } finally {
    if (!$experimentStats.HasExited) { Stop-Process -Id $experimentStats.Id }
  }
  # Identical recovery between repetitions; no cache flushing or workload changes.
  if ($experimentRun -lt $Repeats) { Start-Sleep -Seconds 60 }
}
Write-Output "Finished experiment: $experimentDirectory"
