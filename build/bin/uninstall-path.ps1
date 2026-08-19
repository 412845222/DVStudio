<#
.SYNOPSIS
  从 HKCU\Environment\PATH 中移除一个目录。
.PARAMETER Path
  要移除的目录。忽略尾部反斜杠差异。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)
$ErrorActionPreference = 'Stop'

$Normalize = { param([string]$P) ($P -split ';' | Select-Object -First 1).Trim().TrimEnd('\') }
$Target = & $Normalize $Path

$Cur = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ([string]::IsNullOrEmpty($Cur)) { exit 0 }

$Segments = @($Cur -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$NewSegments = @()
foreach ($S in $Segments) {
  if ((& $Normalize $S) -ceq $Target) { continue }
  $NewSegments += $S
}

$Next = if ($NewSegments.Count -eq 0) { '' } else { ($NewSegments -join ';') }
[Environment]::SetEnvironmentVariable('PATH', $Next, 'User')

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
