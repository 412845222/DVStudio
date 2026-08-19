<#
.SYNOPSIS
  安全地把一个目录追加到 HKCU\Environment\PATH（用户级，非系统）。
.PARAMETER Path
  要追加的目录（绝对路径）。会自动处理尾部反斜杠归一化（比较时忽略尾部 '\'）。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)
$ErrorActionPreference = 'Stop'

$Normalize = { param([string]$P) $P.Trim().TrimEnd('\') }
$Target = & $Normalize $Path

$Cur = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ([string]::IsNullOrEmpty($Cur)) {
  [Environment]::SetEnvironmentVariable('PATH', $Target, 'User')
} else {
  $Segments = $Cur -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $ContainsItem = $false
  foreach ($S in $Segments) {
    if ((& $Normalize $S) -ceq $Target) { $ContainsItem = $true; break }
  }
  if (-not $ContainsItem) {
    [Environment]::SetEnvironmentVariable('PATH', "$Cur;$Target", 'User')
  }
}

# Notify shell (WM_SETTINGCHANGE) so new processes pick up the PATH.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, int Msg, IntPtr wParam, string lParam, int fuFlags, int uTimeout, out IntPtr lpdwResult);
}
'@ -Name 'DvsPathBroadcast' -Namespace 'DvsNS' -ErrorAction SilentlyContinue
$result = [IntPtr]::Zero
[void][DvsNS.DvsPathBroadcast]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [IntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
exit 0
