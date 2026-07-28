$roots = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -match 'chatgpt-desktop-community' -and $_.CommandLine -notmatch '--type=' }
foreach ($p in $roots) {
  Write-Output "killing root PID $($p.ProcessId)"
  & taskkill /PID $p.ProcessId /T /F | Out-Null
}
