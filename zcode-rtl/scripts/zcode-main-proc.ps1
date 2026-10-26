# Returns the REAL ZCode main app process (or nothing). The agent runtime
# child (`ZCode.exe ... zcode.cjs app-server --stdio`) is also named
# ZCode.exe — it must be excluded, or a lingering child after the user quits
# the app would look like "the app is running".
Get-CimInstance Win32_Process -Filter "name='ZCode.exe'" |
  Where-Object {
    $_.CommandLine -notlike '*--type=*' -and
    $_.CommandLine -notlike '*app-server*' -and
    $_.CommandLine -notlike '*zcode.cjs*'
  } |
  Select-Object -First 1 ProcessId, CommandLine | ConvertTo-Json
