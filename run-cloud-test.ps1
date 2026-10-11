param()
$ErrorActionPreference = 'Stop'
$Vus = 2200
$types = @('load', 'spike', 'stress')
$accountMode = 'reuse'
$latencyMode = 'strict'
$suiteClock = [System.Diagnostics.Stopwatch]::StartNew()
$suiteExit = 0
Write-Host "Cloud generator -> direct origin; peak $Vus VUs. Sequence: $($types -join ', ')."
Write-Host "Account mode: $accountMode. Existing accounts only; no users will be created."
Write-Host 'Latency and error thresholds enabled for reporting. Threshold failures do not interrupt a test or skip subsequent tests.'
Write-Host 'Scheduled traffic: load 9m + spike 3m20s + stress 20m, with two 1m recovery gaps. Allow roughly 37-42 minutes including preparation/downloads.'
for ($i = 0; $i -lt $types.Count; $i++) {
  Write-Host "`n[$($i + 1)/$($types.Count)] Starting $($types[$i]); suite elapsed $($suiteClock.Elapsed.ToString('hh\:mm\:ss'))"
  & node (Join-Path $PSScriptRoot 'k6/cloud-suite.mjs') $types[$i] $Vus $accountMode $latencyMode
  $code = $LASTEXITCODE
  if ($code -ne 0 -and $code -ne 99) {
    Write-Host "Execution stopped (exit $code). Remaining tests will not start."
    exit $code
  }
  if ($code -eq 99) {
    $suiteExit = 99
    Write-Host 'Test completed with failed thresholds; results saved. Continuing the scheduled sequence.'
  }
  if ($i -lt ($types.Count - 1)) {
    $gapClock = [System.Diagnostics.Stopwatch]::StartNew()
    while ($gapClock.Elapsed.TotalSeconds -lt 60) {
      $remaining = [int][Math]::Ceiling(60 - $gapClock.Elapsed.TotalSeconds)
      Write-Progress -Activity 'Recovery gap before next test' -Status "$remaining seconds remaining" -SecondsRemaining $remaining -PercentComplete ([Math]::Min(100, $gapClock.Elapsed.TotalSeconds / 60 * 100))
      Start-Sleep -Seconds 1
    }
    Write-Progress -Activity 'Recovery gap before next test' -Completed
  }
}
Write-Host "`nSequence finished in $($suiteClock.Elapsed.ToString('hh\:mm\:ss')). Results are in test-results (one cloud folder per test)."
exit $suiteExit
