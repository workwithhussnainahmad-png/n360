param()
$ErrorActionPreference = 'Stop'
Write-Host 'One 2200-VU stress run with a bounded 30-second CPU capture during peak. Allow 22-25 minutes.'
Write-Host 'Existing accounts are reused. Results and profiles download into test-results. Keep this terminal connected.'
& node (Join-Path $PSScriptRoot 'k6/cloud-suite.mjs') stress 2200 reuse strict profile
exit $LASTEXITCODE
