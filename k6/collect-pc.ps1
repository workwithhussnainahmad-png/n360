$ErrorActionPreference = 'Stop'
@{ type='ready'; time=[datetime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress
while ($true) {
  try {
    $cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    $memory = Get-CimInstance Win32_OperatingSystem
    $processes = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -match '^(k6|node)(#\d+)?$' } | Select-Object Name,IDProcess,PercentProcessorTime,WorkingSetPrivate,HandleCount
    $tcp = Get-NetTCPConnection -ErrorAction SilentlyContinue | Group-Object State | Select-Object Name,Count
    $udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Group-Object OwningProcess | Sort-Object Count -Descending | Select-Object -First 8 Name,Count
    @{ type='sample'; time=[datetime]::UtcNow.ToString('o'); cpuPercent=$cpu.PercentProcessorTime;
       freeMemoryKB=$memory.FreePhysicalMemory; processes=@($processes); tcp=@($tcp); udp=@($udp);
       adapters=@(Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes,ReceivedPacketErrors,OutboundPacketErrors,ReceivedDiscardedPackets,OutboundDiscardedPackets)
    } | ConvertTo-Json -Depth 5 -Compress
  } catch {
    @{type='error';time=[datetime]::UtcNow.ToString('o');message='Local sampling failed'} | ConvertTo-Json -Compress
  }
  Start-Sleep -Seconds 5
}
