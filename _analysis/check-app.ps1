$procs = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -match 'chatgpt-desktop-community' }
if ($procs) {
  $procs | ForEach-Object { Write-Output "PID $($p.ProcessId)" }
  Write-Output "running: $($procs.Count) processes"
} else {
  Write-Output "not running"
}
