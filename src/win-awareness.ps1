# ChrispyNi Desktop Companion - Windows active-window watcher (read-only). Prints one JSON line when something changes.
# No keystrokes, no screenshots: only the foreground window title/process, whether it is fullscreen,
# and (when Windows exposes it) whether any media session is playing.
param([int]$Seconds = 3)
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class PWWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
}
"@
# Windows media session (best effort; absent on some systems)
$media = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $mgrT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $op = $mgrT::RequestAsync(); $t = $asTask.MakeGenericMethod($mgrT).Invoke($null, @($op)); $t.Wait(3000) | Out-Null; $media = $t.Result
} catch { $media = $null }
$last = ""
while ($true) {
  try {
    $h = [PWWin]::GetForegroundWindow(); $sb = New-Object System.Text.StringBuilder 512
    [void][PWWin]::GetWindowText($h, $sb, 512); $procId = 0; [void][PWWin]::GetWindowThreadProcessId($h, [ref]$procId)
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $r = New-Object PWWin+RECT; [void][PWWin]::GetWindowRect($h, [ref]$r)
    $fs = (($r.R - $r.L) -ge [PWWin]::GetSystemMetrics(0)) -and (($r.B - $r.T) -ge [PWWin]::GetSystemMetrics(1))
    $playing = $null
    if ($media) { try { $s = $media.GetCurrentSession(); if ($s) { $playing = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') } else { $playing = $false } } catch {} }
    $o = @{ title = $sb.ToString(); owner = $(if ($p) { $p.ProcessName } else { "" }); process = $(if ($p) { $p.ProcessName + ".exe" } else { "" }); fullscreen = $fs; playing = $playing }
    $line = ($o | ConvertTo-Json -Compress)
    if ($line -ne $last) { $last = $line; [Console]::Out.WriteLine($line); [Console]::Out.Flush() }
  } catch {}
  Start-Sleep -Seconds $Seconds
}
