# Project Wives - tells the app when a mouse button is pressed anywhere (or Esc), so open menus can close
# without the overlay ever taking focus. Reads only the button/Esc state; no other keys, no positions logged.
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class PWKeys { [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int v); }
"@
$keys = @{ 1 = 'L'; 2 = 'R'; 4 = 'M'; 27 = 'esc' }; $prev = @{}
while ($true) {
  foreach ($k in $keys.Keys) {
    $down = ([PWKeys]::GetAsyncKeyState($k) -band 0x8000) -ne 0
    if ($down -and -not $prev[$k]) { [Console]::Out.WriteLine($keys[$k]); [Console]::Out.Flush() }
    $prev[$k] = $down
  }
  Start-Sleep -Milliseconds 30
}
