# Project Wives - Windows active-window watcher (read-only). Prints one JSON line when the foreground window changes.
# No keystrokes, no screenshots: only the window title and process name.
param([int]$Seconds = 3)
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class PWWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$last = ""
while ($true) {
  try {
    $h = [PWWin]::GetForegroundWindow(); $sb = New-Object System.Text.StringBuilder 512
    [void][PWWin]::GetWindowText($h, $sb, 512); $procId = 0; [void][PWWin]::GetWindowThreadProcessId($h, [ref]$procId)
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $o = @{ title = $sb.ToString(); owner = $(if ($p) { $p.ProcessName } else { "" }); process = $(if ($p) { $p.ProcessName + ".exe" } else { "" }) }
    $line = ($o | ConvertTo-Json -Compress)
    if ($line -ne $last) { $last = $line; [Console]::Out.WriteLine($line); [Console]::Out.Flush() }
  } catch {}
  Start-Sleep -Seconds $Seconds
}
