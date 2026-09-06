<#
.SYNOPSIS
  DVStudio CLI (dvs-cli) — pure PowerShell client, NO Node.js required.
  Talks HTTP to the CLI control server running inside an already-opened
  DVStudio (or the dev:electron session).

.USAGE
  Direct (bypasses execution policy):
    powershell -NoProfile -ExecutionPolicy Bypass -File dvs-cli.ps1 help

  Via the bundled launcher dvs-cli.cmd (recommended, works once in PATH):
    dvs-cli help
#>

# NOTE: intentionally NO [CmdletBinding()] and NO formal param() block.
# Reason: with [CmdletBinding()], PowerShell would treat flags like
# "--prompt" / "--width" / "--output-path" as NAMED script parameters
# and throw "NamedParameterNotFound" before any of our code runs, because
# we do manual flag parsing below (keeping parity with the Node CLI).
# Using the automatic $args variable keeps us in full control.

$Command = if ($args.Count -gt 0) { "$($args[0])" } else { 'help' }
$RestArgs = if ($args.Count -gt 1) { [object[]]$args[1..($args.Count - 1)] } else { @() }
# ---------- Manual arg parser (keeps parity with Node CLI flags: --key val / --key=val / -flag) ----------
$Opts = @{}
$Positional = @($Command)

function Add-OptValue([string]$Key, [string]$Value) {
  $NormKey = $Key -replace '-', ''
  if (-not $Opts.ContainsKey($NormKey)) {
    $Opts[$NormKey] = $Value
  } else {
    $Cur = $Opts[$NormKey]
    if ($Cur -is [array]) { $Opts[$NormKey] = $Cur + @($Value) } else { $Opts[$NormKey] = @($Cur, $Value) }
  }
}

$i = 0
while ($i -lt $RestArgs.Count) {
  $Tok = "$($RestArgs[$i])"
  if (-not $Tok.StartsWith('-')) {
    $Positional += $Tok
    $i++
    continue
  }
  if ($Tok -match '^--(?<k>[^=]+)=(?<v>.*)$') {
    Add-OptValue $Matches.k $Matches.v
    $i++
    continue
  }
  $RawKey = $Tok.TrimStart('-')
  $Key = $RawKey -replace '-', ''
  if ($RawKey -eq 'help' -or $RawKey -eq 'h') {
    $Opts['help'] = $true
    $i++
    continue
  }
  if ($RawKey.StartsWith('no-')) {
    $Stripped = ($RawKey.Substring(3)) -replace '-', ''
    $Opts[$Stripped] = $false
    $i++
    continue
  }
  # --flag (no value), followed by next token as value if it doesn't start with dash
  if ($i + 1 -lt $RestArgs.Count) {
    $Next = "$($RestArgs[$i + 1])"
    if (-not $Next.StartsWith('-')) {
      Add-OptValue $RawKey $Next
      $i += 2
      continue
    }
  }
  $Opts[$Key] = $true
  $i++
}

if ($Opts.ContainsKey('help') -or $Command -eq 'help') {
@'
  DVStudio CLI (dvs-cli) - controls the currently running DVStudio app.

  USAGE:
    dvs-cli <command> [options]

  COMMANDS:
    status                               Checks CLI control server health (no token required).
    tools                                Lists Agent/tool metadata.
    generate-image                       Submits a text-to-image task (default: seedream).
    list-tasks                           Lists recent CLI tasks.
    get-task --task-id <ID>              Shows detail for a single task.
    cancel-task --task-id <ID>           Cancels a task.
    wait-task --task-id <ID>             Polls until task finishes.
    help                                 Prints this help text.

  GENERATE-IMAGE OPTIONS (recommended: Seedream-native flags --seedream-size + --seedream-aspect-ratio):
    --prompt "..."                       (required) Prompt text.
    ===== Seedream-native (matches blueprint parameter panel):
    --seedream-size 1K|2K|3K|4K          Blueprint Size Preset (DEFAULT: 2K). Priority over width/height.
    --seedream-aspect-ratio <ratio>      Blueprint Aspect Ratio (DEFAULT: 1:1). One of: 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3 / 21:9
    --seedream-quantity 1|2|4            Number of images (DEFAULT: 1). Seedream only supports 1 / 2 / 4; higher values are clamped.
    --seedream-watermark true|false      Watermark overlay (DEFAULT: false).
    --seedream-output-format jpeg|png    Output format (DEFAULT: jpeg).
    --seedream-seed <int>                Random seed, -1 = random (DEFAULT: -1). Same as legacy --seed.
    --seedream-negative-prompt "..."     Negative prompt. Same as legacy --negative-prompt.
    --seedream-model-version <name>      Seedream model version / blueprint dropdown alias
                                         (DEFAULT: doubao-seedream-4-5-251128). Alias of --seedream-endpoint.
    --seedream-endpoint <id>             REAL Doubao Ark / Seedream Endpoint ID (HIGHEST priority).
                                         Must be a real inference endpoint ID from the Volcengine Ark console,
                                         e.g. ep-20240819xxxxx  or  doubao-seedream-5-0-260128.
    ===== Legacy (still supported, normalized server-side):
    --width <num>                        Default: 1024
    --height <num>                       Default: 1024
    --aspect-ratio <s>                   Example: 1:1 / 16:9 / 3:4
    --image-count <n>                    Default: 1
    --seed <n>                           -1 = random
    --negative-prompt "..."              Negative prompt.
    --model <name>                       Provider or raw Ark Endpoint ID alias (LOWEST priority, only
                                         ep-/doubao-/seedream-/jimeng-/seedance-/bytedance-/volc- prefixes are
                                         trusted; otherwise SILENTLY falls back to the default Seedream model
                                         with a WARN log — it will NOT error out on typos / unsupported names).
    ===== Task control:
    --project-id <num>                   Blueprint project id (default = current open project).
    --output-path <path>                 Absolute output path or file name (default = Blueprint Content\Media).
    --reference <path>                   Repeatable, reference image(s).
    --no-auto-export                     Do not copy to outputPath after generation (temp-only).
    --no-wait                            Submit only; returns immediately (prints taskId).
    --timeout <seconds>                  Wait timeout in seconds. Default: 180.
    --json                               Output machine-readable JSON on stdout.

  CONNECTION DISCOVERY (checked in order):
    env:DWEB_RESOURCE_DIR\Runtime\cli-control-server.json
    <ScriptDir>\..\..\DVSResource\Runtime\cli-control-server.json   (portable/installed layout, any drive)
    $PWD\DVSResource\Runtime\cli-control-server.json
    $env:APPDATA\DVStudio\DVSResource\Runtime\cli-control-server.json   (installed exe layout)
    $env:APPDATA\DVSResource\Runtime\cli-control-server.json            (legacy)
    $HOME\.dvs\DVSResource\Runtime\cli-control-server.json
    OR env override:
      DVS_CLI_HOST / DVS_CLI_PORT / DVS_CLI_TOKEN
'@
  exit 0
}

# ---------- Runtime discovery (works for dev:electron AND installed exe layout, ANY drive) ----------
$RuntimeFile = 'cli-control-server.json'

function Get-CandidatePaths() {
  $List = @()
  $EnvRes = if ($env:DWEB_RESOURCE_DIR) { "$($env:DWEB_RESOURCE_DIR)".Trim() } else { $null }
  if ($EnvRes) { $List += Join-Path $EnvRes 'Runtime' | Join-Path -ChildPath $RuntimeFile }

  # Derive install root from where THIS script lives.
  # Bundled layout: <InstallRoot>\DVStudio\build\bin\dvs-cli.ps1  OR  <InstallRoot>\DVSResource\bin\dvs-cli.ps1
  try {
    $ScriptDir = Split-Path -Parent $PSCommandPath
    $D1 = Split-Path -Parent $ScriptDir             # build\bin → build
    $D2 = Split-Path -Parent $D1                     # build → DVStudio
    $InstallRoot = Split-Path -Parent $D2            # DVStudio → <InstallRoot>
    if ($InstallRoot) { $List += Join-Path $InstallRoot 'DVSResource' | Join-Path -ChildPath "Runtime\$RuntimeFile" }
  } catch { }
  $List += Join-Path (Get-Location).Path 'DVSResource' | Join-Path -ChildPath "Runtime\$RuntimeFile"
  if ($env:APPDATA) {
    $List += Join-Path $env:APPDATA "DVStudio\DVSResource\Runtime\$RuntimeFile"
    $List += Join-Path $env:APPDATA "DVSResource\Runtime\$RuntimeFile"
  }
  $List += Join-Path $HOME ".dvs\DVSResource\Runtime\$RuntimeFile"
  return $List
}

function Read-Runtime() {
  if ($env:DVS_CLI_PORT) {
    $Port = [int]0
    if ([int]::TryParse("$env:DVS_CLI_PORT", [ref]$Port) -and $Port -gt 0) {
      return [PSCustomObject]@{
        ok = $true
        host = $(if ($env:DVS_CLI_HOST) { "$env:DVS_CLI_HOST".Trim() } else { '127.0.0.1' })
        port = $Port
        token = $(if ($env:DVS_CLI_TOKEN) { "$env:DVS_CLI_TOKEN".Trim() } else { $null })
        from = 'env'
      }
    }
  }
  foreach ($FilePath in Get-CandidatePaths) {
    if (Test-Path -LiteralPath $FilePath) {
      try {
        $Raw = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
        $Cfg = $Raw | ConvertFrom-Json -ErrorAction Stop
        return [PSCustomObject]@{
          ok = $true
          host = $(if ($Cfg.host) { "$($Cfg.host)".Trim() } else { '127.0.0.1' })
          port = [int]$Cfg.port
          token = $(if ($Cfg.token) { "$($Cfg.token)".Trim() } else { $null })
          pid = $(if ($Cfg.pid) { [int]$Cfg.pid } else { 0 })
          version = $(if ($Cfg.version) { "$($Cfg.version)" } else { '' })
          startedAt = $(if ($Cfg.startedAt) { "$($Cfg.startedAt)" } else { '' })
          filePath = $FilePath
          from = 'file'
        }
      } catch {
        [Console]::Error.WriteLine(("[dvs-cli] runtime file corrupt (" + $FilePath + "): " + $_.Exception.Message))
      }
    }
  }
  $__ret = New-Object PSObject
    Add-Member      -InputObject $__ret      -NotePropertyName 'ok'  -NotePropertyValue ($false)  -Force
    Add-Member      -InputObject $__ret      -NotePropertyName 'error'  -NotePropertyValue ('DVStudio is not running (runtime file not found)')  -Force
    Add-Member      -InputObject $__ret      -NotePropertyName 'candidates'  -NotePropertyValue ((Get    Get-CandidatePaths))  -Force
    return $__ret
}

# ---------- Robust JSON helpers (defined BEFORE Invoke-DvsApi so scoping is unambiguous) ----------
#   PS5 ConvertTo-Json / ConvertFrom-Json can trip on older hosts (missing -Depth,
#   BOM chars, etc.).  We implement wrappers that ALWAYS succeed, degrading gracefully.
function ConvertTo-JsonSafe([object]$Value, [int]$Depth = 10, [switch]$Compress) {
  $err1 = $null
  try {
    if ($Compress) { return ($Value | ConvertTo-Json -Depth $Depth -Compress -ErrorAction Stop) }
    return ($Value | ConvertTo-Json -Depth $Depth -ErrorAction Stop)
  } catch { $err1 = $_.Exception.Message }
  try {
    if ($Compress) { return ($Value | ConvertTo-Json -Compress -ErrorAction Stop) }
    return ($Value | ConvertTo-Json -ErrorAction Stop)
  } catch { }
  try {
    Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
    $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $ser.MaxJsonLength = 100 * 1024 * 1024
    return $ser.Serialize($Value)
  } catch { return '{}' }
}

function ConvertFrom-JsonSafe([string]$Text, [ref]$FailedOut = $null) {
  if ($null -eq $Text) { if ($FailedOut) { $FailedOut.Value = $true }; return [PSCustomObject]@{ __parseFailed = $true; parseSource = 'null-text'; raw = '' } }
  $t = "$Text".Trim()
  if ($t.Length -gt 0 -and [int][char]$t[0] -eq 0xFEFF) { $t = $t.Substring(1).Trim() }
  if ($t.Length -eq 0) { if ($FailedOut) { $FailedOut.Value = $true }; return [PSCustomObject]@{ __parseFailed = $true; parseSource = 'empty-text'; raw = '' } }
  $cvtErr = $null
  try {
    $obj = ConvertFrom-Json -InputObject $t -Depth 50 -ErrorAction Stop
    if ($null -ne $obj) { if ($FailedOut) { $FailedOut.Value = $false }; return $obj }
  } catch { if (-not $cvtErr) { $cvtErr = $_.Exception.Message } }
  try {
    $obj = ConvertFrom-Json -InputObject $t -ErrorAction Stop
    if ($null -ne $obj) { if ($FailedOut) { $FailedOut.Value = $false }; return $obj }
  } catch { if (-not $cvtErr) { $cvtErr = $_.Exception.Message } }
  try {
    Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
    $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $serializer.MaxJsonLength = 100 * 1024 * 1024
    $rawObj = $serializer.DeserializeObject($t)
    if ($null -eq $rawObj) { throw 'null' }
    $round = ConvertTo-JsonSafe -Value $rawObj -Depth 50 -Compress
    try { $obj = ConvertFrom-Json -InputObject $round -Depth 50 -ErrorAction Stop } catch { $obj = ConvertFrom-Json -InputObject $round -ErrorAction Stop }
    if ($FailedOut) { $FailedOut.Value = $false }
    return $obj
  } catch {
    if ($FailedOut) { $FailedOut.Value = $true }
    return [PSCustomObject]@{
      __parseFailed = $true
      parseSource = 'all-attempts-failed'
      convertFromJsonError = $cvtErr
      javaScriptSerializerError = $_.Exception.Message
      raw = $t
    }
  }
}

function Invoke-DvsApi([string]$Method, [string]$ApiHost, [int]$Port, [string]$Pathname, [object]$Body = $null, [string]$Token = $null, [int]$TimeoutMs = 15000) {
  $Url = 'http://' + $ApiHost + ':' + $Port + $Pathname
  $Headers = @{}
  if ($Token) { $Headers['x-dvs-cli-token'] = $Token }
  try {
    if ($null -eq $Body) {
      $Resp = Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec ([Math]::Ceiling($TimeoutMs/1000)) -ErrorAction Stop
    } else {
      $Json = ConvertTo-JsonSafe -Value $Body -Depth 10 -Compress
      $Headers['Content-Type'] = 'application/json; charset=utf-8'
      $BodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
      $Resp = Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers -Body $BodyBytes -UseBasicParsing -TimeoutSec ([Math]::Ceiling($TimeoutMs/1000)) -ErrorAction Stop
    }
    $parseFailed = $false
    $Data = if ($Resp.Content -ne $null -and ([string]$Resp.Content).Length -gt 0) {
      ConvertFrom-JsonSafe ([string]$Resp.Content) ([ref]$parseFailed)
    } else { [PSCustomObject]@{} }
    $__ret = New-Object PSObject
      Add-Member        -InputObject $__ret        -NotePropertyName 'status' -NotePropertyValue ([int]$Resp.StatusCode) -Force
      Add-Member        -InputObject $__ret        -NotePropertyName 'data' -NotePropertyValue ($Data) -Force
      Add-Member        -InputObject $__ret        -NotePropertyName 'parseFailed' -NotePropertyValue ($parseFailed) -Force
      return $__ret
  } catch {
    $WebErr = $_.Exception.Response
    if ($null -ne $WebErr) {
      try {
        $Reader = New-Object System.IO.StreamReader($WebErr.GetResponseStream())
        $ErrText = $Reader.ReadToEnd()
        $Reader.Close()
        $parseFailed = $false
        $Data = if ($ErrText -and $ErrText.Length -gt 0) { ConvertFrom-JsonSafe $ErrText ([ref]$parseFailed) } else { [PSCustomObject]@{} }
        $__ret = New-Object PSObject
          Add-Member            -InputObject $__ret            -NotePropertyName 'status'     -NotePropertyValue ([int]$WebErr.StatusCode)     -Force
          Add-Member            -InputObject $__ret            -NotePropertyName 'data'     -NotePropertyValue ($Data)     -Force
          Add-Member            -InputObject $__ret            -NotePropertyName 'parseFailed'     -NotePropertyValue ($parseFailed)     -Force
          return $__ret
      } catch { }
    }
    return [PSCustomObject]@{
      status = 0
      parseFailed = $false
      data = [PSCustomObject]@{
        error = 'HTTP_ERROR'
        message = $_.Exception.Message
        code = $_.Exception.GetType().Name
      }
    }
  }
}

function Get-NormVal([string]$Name, $Default = $null) {
  if ($Opts.ContainsKey($Name)) { return $Opts[$Name] }
  return $Default
}
function Get-AsArray([string]$Name) {
  if (-not $Opts.ContainsKey($Name)) { return @() }
  $V = $Opts[$Name]
  $Arr = @()
  if ($V -is [array]) { foreach ($x in $V) { foreach ($p in "$x".Split(';')) { if ($p.Trim()) { $Arr += $p.Trim() } } } }
  else { foreach ($p in "$V".Split(';')) { if ($p.Trim()) { $Arr += $p.Trim() } } }
  return $Arr
}

function Wait-Task([object]$Rt, [string]$TaskId, [int]$TimeoutS = 180, [int]$PollMs = 1000) {
  $Deadline = (Get-Date).AddSeconds($TimeoutS)
  while ((Get-Date) -lt $Deadline) {
    $R = Invoke-DvsApi -Method GET -ApiHost $Rt.host -Port $Rt.port -Token $Rt.token -Pathname ("/v1/tasks/" + [Uri]::EscapeDataString($TaskId))
    if ($R.status -eq 200 -and $R.data -and $R.data.ok -and $R.data.task) {
      $St = "$($R.data.task.status)".ToLowerInvariant()
      if ($St -ne 'running' -and $St -ne 'pending') {
        $__ret = New-Object PSObject
          Add-Member            -InputObject $__ret            -NotePropertyName 'done'     -NotePropertyValue ($true)     -Force
          Add-Member            -InputObject $__ret            -NotePropertyName 'timeout'     -NotePropertyValue ($false)     -Force
          Add-Member            -InputObject $__ret            -NotePropertyName 'response'     -NotePropertyValue ($R)     -Force
          return $__ret
      }
    }
    Start-Sleep -Milliseconds $PollMs
  }
  $Last = Invoke-DvsApi -Method GET -ApiHost $Rt.host -Port $Rt.port -Token $Rt.token -Pathname ("/v1/tasks/" + [Uri]::EscapeDataString($TaskId))
  $__ret = New-Object PSObject
    Add-Member      -InputObject $__ret      -NotePropertyName 'done'  -NotePropertyValue ($false)  -Force
    Add-Member      -InputObject $__ret      -NotePropertyName 'timeout'  -NotePropertyValue ($true)  -Force
    Add-Member      -InputObject $__ret      -NotePropertyName 'response'  -NotePropertyValue ($Last)  -Force
    return $__ret
}

$Rt = Read-Runtime
if (-not $Rt.ok) {
  [Console]::Error.WriteLine("[dvs-cli] Cannot connect to DVStudio (please start DVStudio or dev:electron first): " + $Rt.error)
  [Console]::Error.WriteLine("Candidates:")
  foreach ($C in $Rt.candidates) { [Console]::Error.WriteLine(("  - " + $C)) }
  exit 10
}

filter ConvertTo-DvsJson {
  $s = ConvertTo-JsonSafe -Value $_ -Depth 20
  $s
}

# ---------- commands ----------
if ($Command -eq 'status' -or $Command -eq 'health') {
  $R = Invoke-DvsApi -Method GET -ApiHost $Rt.host -Port $Rt.port -Pathname '/health'
  $__out = New-Object PSObject
    Add-Member      -InputObject $__out      -NotePropertyName 'ok'  -NotePropertyValue (($R.status     -eq 200))  -Force
    Add-Member      -InputObject $__out      -NotePropertyName 'runtime'  -NotePropertyValue ($Rt)  -Force
    Add-Member      -InputObject $__out      -NotePropertyName 'data'  -NotePropertyValue ($R.data)  -Force
    Add-Member      -InputObject $__out      -NotePropertyName 'httpStatus'  -NotePropertyValue ($R.status)  -Force
  $__out | ConvertTo-DvsJson
  if ($R.status -eq 200) { exit 0 } else { exit 1 }
}

if ($Command -eq 'tools') {
  $R = Invoke-DvsApi -Method GET -ApiHost $Rt.host -Port $Rt.port -Token $Rt.token -Pathname '/tools'
  $R.data | ConvertTo-DvsJson
  if ($R.status -eq 200) { exit 0 } else { exit 2 }
}


if ($Command -eq 'list-tasks' -or $Command -eq 'list') {
  $Limit = [int](Get-NormVal 'limit' 50); if ($Limit -le 0) { $Limit = 50 }
  $Offset = [int](Get-NormVal 'offset' 0)
  $Qs = [System.Web.HttpUtility]::ParseQueryString('')
  $Qs['limit'] = "$Limit"
  $Qs['offset'] = "$Offset"
  $Fs = Get-NormVal 'filtersource'; if (-not $Fs) { $Fs = Get-NormVal 'source' }
  if (-not [string]::IsNullOrWhiteSpace("$Fs")) { $Qs['filterSource'] = "$Fs".Trim() }
  $St = Get-NormVal 'status'; if (-not [string]::IsNullOrWhiteSpace("$St")) { $Qs['status'] = "$St".Trim() }
  $R = Invoke-DvsApi -Method GET -ApiHost $Rt.host -Port $Rt.port -Token $Rt.token -Pathname ("/v1/tasks?" + $Qs.ToString())
  $R.data | ConvertTo-DvsJson
  if ($R.status -eq 200) { exit 0 } else { exit 5 }
}

if ($Command -eq 'get-task') {
  $Id = (Get-NormVal 'taskid' '').Trim(); if (-not $Id) { $Id = (Get-NormVal 'taskId' '').Trim() }
  if (-not $Id) { [Console]::Error.WriteLine('[dvs-cli] get-task needs --task-id'); exit 400 }
  $R = Invoke-DvsApi -Method GET -ApiHost $Rt.host -Port $Rt.port -Token $Rt.token -Pathname ("/v1/tasks/" + [Uri]::EscapeDataString($Id))
  $R.data | ConvertTo-DvsJson
  if ($R.status -eq 200) { exit 0 } else { exit 6 }
}

if ($Command -eq 'cancel-task') {
  $Id = (Get-NormVal 'taskid' '').Trim(); if (-not $Id) { $Id = (Get-NormVal 'taskId' '').Trim() }
  if (-not $Id) { [Console]::Error.WriteLine('[dvs-cli] cancel-task needs --task-id'); exit 400 }
  $CancelBody = New-Object PSObject
  $R = Invoke-DvsApi -Method POST -ApiHost $Rt.host -Port $Rt.port -Token $Rt.token -Pathname ("/v1/tasks/" + [Uri]::EscapeDataString($Id) + "/cancel") -Body $CancelBody
  $R.data | ConvertTo-DvsJson
  if ($R.status -eq 200 -and $R.data.ok) { exit 0 } else { exit 7 }
}

if ($Command -eq 'wait-task') {
  $Id = (Get-NormVal 'taskid' '').Trim(); if (-not $Id) { $Id = (Get-NormVal 'taskId' '').Trim() }
  if (-not $Id) { [Console]::Error.WriteLine('[dvs-cli] wait-task needs --task-id'); exit 400 }
  $TimeoutS = [int](Get-NormVal 'timeout' 180); if ($TimeoutS -le 0) { $TimeoutS = 180 }
  $W = Wait-Task -Rt $Rt -TaskId $Id -TimeoutS $TimeoutS
  if ($W.response -and $W.response.data -and $W.response.data.task) { $WtStatus = [string]$W.response.data.task.status } else { $WtStatus = '' }
  $WtDoneOk = ($W.done -and $WtStatus -eq 'completed')
  if ($W.response -and $W.response.data -and $W.response.data.task) { $WtTask = $W.response.data.task } else { $WtTask = $null }
  if ($W.response -and $W.response.data) { $WtRaw = $W.response.data } else { $WtRaw = $null }
  $__out = New-Object PSObject
  Add-Member -InputObject $__out -NotePropertyName ok -NotePropertyValue $WtDoneOk -Force
  Add-Member -InputObject $__out -NotePropertyName timeout -NotePropertyValue $W.timeout -Force
  Add-Member -InputObject $__out -NotePropertyName taskId -NotePropertyValue $Id -Force
  Add-Member -InputObject $__out -NotePropertyName task -NotePropertyValue $WtTask -Force
  Add-Member -InputObject $__out -NotePropertyName raw -NotePropertyValue $WtRaw -Force
  $__out | ConvertTo-DvsJson
  if ($WtDoneOk) { exit 0 } else { exit 8 }
}


if ($Command -eq 'generate-image') {
  # PS5 终极兼容：generate-image 内部代码体以 UTF-16LE Base64 存储，完全规避 PS5 解析器对嵌套字面量/Add-Member/} 关闭时的回溯歧义 bug。
  # 运行时解码为 PowerShell 代码，再用 Invoke-Expression 在独立解析上下文执行。
  $__genImgB64 = @'

IAAgACQAUAByAG8AbQBwAHQAIAA9ACAAKABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHAAcgBvAG0AcAB0ACcAIAAnACcAKQAuAFQAcgBpAG0AKAApAA0ACgAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABQAHIAbwBtAHAAdAApACAAewANAAoAIAAgACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARQByAHIAbwByAC4AVwByAGkAdABlAEwAaQBuAGUAKAAnAFsAZAB2AHMALQBjAGwAaQBdACAAZwBlAG4AZQByAGEAdABlAC0AaQBtAGEAZwBlACAAcgBlAHEAdQBpAHIAZQBzACAALQAtAHAAcgBvAG0AcAB0ACcAKQANAAoAIAAgACAAIAAkAF8AXwBvAHUAdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUABTAE8AYgBqAGUAYwB0AA0ACgAgACAAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAAIAAgACAAIAAgACAAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAXwBfAG8AdQB0ACAAIAAgACAAIAAgACAAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AE4AYQBtAGUAIAAnAG8AawAnACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAoACQAZgBhAGwAcwBlACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgACAAIAAgACAAIAAgACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgACAAIAAgACAAIAAgACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAJwBlAHIAcgBvAHIAJwAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAnAE0ASQBTAFMASQBOAEcAXwBQAFIATwBNAFAAVAAnACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIAAkAF8AXwBvAHUAdAAgAHwAIABDAG8AbgB2AGUAcgB0AFQAbwAtAEQAdgBzAEoAcwBvAG4ADQAKACAAIAAgACAAZQB4AGkAdAAgADQAMAAwAA0ACgAgACAAfQANAAoAIAAgACQAUABhAHkAbABvAGEAZAAgAD0AIABbAG8AcgBkAGUAcgBlAGQAXQBAAHsAIABwAHIAbwBtAHAAdAAgAD0AIAAkAFAAcgBvAG0AcAB0ACAAfQANAAoAIAAgACQAUgBhAHcAVwBpAGQAdABoACAAPQAgACQAbgB1AGwAbAA7ACAAJABSAGEAdwBIAGUAaQBnAGgAdAAgAD0AIAAkAG4AdQBsAGwADQAKACAAIAAkAFYAIAA9ACAARwBlAHQALQBOAG8AcgBtAFYAYQBsACAAJwB3AGkAZAB0AGgAJwA7ACAAaQBmACAAKAAkAG4AdQBsAGwAIAAtAG4AZQAgACQAVgApACAAewAgACQAUgBhAHcAVwBpAGQAdABoACAAPQAgAFsAaQBuAHQAXQAkAFYAOwAgACQAUABhAHkAbABvAGEAZABbACcAdwBpAGQAdABoACcAXQAgAD0AIAAkAFIAYQB3AFcAaQBkAHQAaAAgAH0ADQAKACAAIAAkAFYAIAA9ACAARwBlAHQALQBOAG8AcgBtAFYAYQBsACAAJwBoAGUAaQBnAGgAdAAnADsAIABpAGYAIAAoACQAbgB1AGwAbAAgAC0AbgBlACAAJABWACkAIAB7ACAAJABSAGEAdwBIAGUAaQBnAGgAdAAgAD0AIABbAGkAbgB0AF0AJABWADsAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAGgAZQBpAGcAaAB0ACcAXQAgAD0AIAAkAFIAYQB3AEgAZQBpAGcAaAB0ACAAfQANAAoAIAAgACQAUgBhAHcAQQBzAHAAZQBjAHQAIAA9ACAAJABuAHUAbABsAA0ACgAgACAAJABWACAAPQAgAEcAZQB0AC0ATgBvAHIAbQBWAGEAbAAgACcAYQBzAHAAZQBjAHQAcgBhAHQAaQBvACcAOwAgAGkAZgAgACgAJABuAHUAbABsACAALQBuAGUAIAAkAFYAKQAgAHsAIAAkAFIAYQB3AEEAcwBwAGUAYwB0ACAAPQAgACIAJABWACIAOwAgACQAUABhAHkAbABvAGEAZABbACcAYQBzAHAAZQBjAHQAUgBhAHQAaQBvACcAXQAgAD0AIAAkAFIAYQB3AEEAcwBwAGUAYwB0ACAAfQANAAoAIAAgACQAUgBhAHcASQBtAGEAZwBlAEMAbwB1AG4AdAAgAD0AIAAkAG4AdQBsAGwADQAKACAAIAAkAFYAIAA9ACAARwBlAHQALQBOAG8AcgBtAFYAYQBsACAAJwBpAG0AYQBnAGUAYwBvAHUAbgB0ACcAOwAgAGkAZgAgACgAJABuAHUAbABsACAALQBuAGUAIAAkAFYAKQAgAHsAIAAkAFIAYQB3AEkAbQBhAGcAZQBDAG8AdQBuAHQAIAA9ACAAWwBpAG4AdABdACQAVgA7ACAAJABQAGEAeQBsAG8AYQBkAFsAJwBpAG0AYQBnAGUAQwBvAHUAbgB0ACcAXQAgAD0AIAAkAFIAYQB3AEkAbQBhAGcAZQBDAG8AdQBuAHQAIAB9AA0ACgAgACAAJABWACAAPQAgAEcAZQB0AC0ATgBvAHIAbQBWAGEAbAAgACcAcwBlAGUAZAAnADsAIABpAGYAIAAoACQAbgB1AGwAbAAgAC0AbgBlACAAJABWACkAIAB7ACAAJABQAGEAeQBsAG8AYQBkAFsAJwBzAGUAZQBkACcAXQAgAD0AIABbAGkAbgB0AF0AJABWACAAfQANAAoAIAAgACQAVgAgAD0AIABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAG4AZQBnAGEAdABpAHYAZQBwAHIAbwBtAHAAdAAnADsAIABpAGYAIAAoACQAbgB1AGwAbAAgAC0AbgBlACAAJABWACkAIAB7ACAAJABQAGEAeQBsAG8AYQBkAFsAJwBuAGUAZwBhAHQAaQB2AGUAUAByAG8AbQBwAHQAJwBdACAAPQAgACIAJABWACIAOwAgACQAUABhAHkAbABvAGEAZABbACcAcwBlAGUAZAByAGUAYQBtAE4AZQBnAGEAdABpAHYAZQBQAHIAbwBtAHAAdAAnAF0AIAA9ACAAIgAkAFYAIgAgAH0ADQAKACAAIAAjACAAPQA9AD0AIABTAGUAZQBkAHIAZQBhAG0AIADCU3BlxIkDgxZTCP8OTt2E/laCgrlwlV7okMJTcGVil39njFtoUflbUJ8J/z0APQA9AD0APQANAAoAIAAgACMAIADdhP5WwlNwZWKXf2fqU6Vj11Ma/3MAZQBlAGQAcgBlAGEAbQBTAGkAegBlACgAMQBLAC8AMgBLAC8AMwBLAC8ANABLACkAIAArACAAcwBlAGUAZAByAGUAYQBtAEEAcwBwAGUAYwB0AFIAYQB0AGkAbwAoADEAOgAxAC8AMQA2ADoAOQAvADkAOgAxADYALwA0ADoAMwAvADMAOgA0AC8AMgAxADoAOQApAA0ACgAgACAAIwAgAEMATABJACAAL2UBYyROzXmTj2VRuWUPXxr/QQApACAA9HalYyBPIAAtAC0AcwBlAGUAZAByAGUAYQBtAC0AcwBpAHoAZQAgACsAIAAtAC0AcwBlAGUAZAByAGUAYQBtAC0AYQBzAHAAZQBjAHQALQByAGEAdABpAG8AG/9CACkAIAAgTyAALQAtAHcAaQBkAHQAaAAvAC0ALQBoAGUAaQBnAGgAdAAgAOqBqFLNU+VnAGc5U02RhHaYW7llhJi+i2NoTU8rANRri08NAAoAIAAgACQAVgBBAEwASQBEAF8AUwBJAFoARQBTACAAPQAgAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABTAHkAcwB0AGUAbQAuAEMAbwBsAGwAZQBjAHQAaQBvAG4AcwAuAEcAZQBuAGUAcgBpAGMALgBIAGEAcwBoAFMAZQB0AFsAcwB0AHIAaQBuAGcAXQAgACgALAAgAFsAcwB0AHIAaQBuAGcAWwBdAF0AQAAoACcAMQBLACcALAAnADIASwAnACwAJwAzAEsAJwAsACcANABLACcAKQApAA0ACgAgACAAJABWAEEATABJAEQAXwBSAEEAVABJAE8AUwAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBDAG8AbABsAGUAYwB0AGkAbwBuAHMALgBHAGUAbgBlAHIAaQBjAC4ASABhAHMAaABTAGUAdABbAHMAdAByAGkAbgBnAF0AIAAoACwAIABbAHMAdAByAGkAbgBnAFsAXQBdAEAAKAAnADEAOgAxACcALAAnADEANgA6ADkAJwAsACcAOQA6ADEANgAnACwAJwA0ADoAMwAnACwAJwAzADoANAAnACwAJwAyADEAOgA5ACcALAAnADMAOgAyACcALAAnADIAOgAzACcAKQApAA0ACgAgACAAIwAgAIxbdGXPUCB9IGYEXGiICP8OTiAAdABoAGkAcgBkAC0AcABhAHIAdAB5AC8AcwBlAHIAdgBpAGMAZQAuAG0AagBzACAAKwAgAHMAZQByAHYAaQBjAGUALgBtAGoAcwAgAIxbaFEATvSBCf8NAAoAIAAgACMAIABQAFMANQAgAHxRuVsa/4F5YmsgAFsAbwByAGQAZQByAGUAZABdAEAAewAgAGsAMQA9AHYAMQA7ACAAawAyAD0AdgAyADsAIAAuAC4ALgAgAH0AIABVU0yIIAA7ACAABlKUlgz/xV97mBCQTIhLjTxQDQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBDAG8AbABsAGUAYwB0AGkAbwBuAHMALgBTAHAAZQBjAGkAYQBsAGkAegBlAGQALgBPAHIAZABlAHIAZQBkAEQAaQBjAHQAaQBvAG4AYQByAHkADQAKACAAIABmAG8AcgBlAGEAYwBoACAAKAAkAHMAegAgAGkAbgAgAEAAKAAnADEASwAnACwAJwAyAEsAJwAsACcAMwBLACcALAAnADQASwAnACkAKQAgAHsADQAKACAAIAAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAkAHMAegBdACAAPQAgAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABTAHkAcwB0AGUAbQAuAEMAbwBsAGwAZQBjAHQAaQBvAG4AcwAuAFMAcABlAGMAaQBhAGwAaQB6AGUAZAAuAE8AcgBkAGUAcgBlAGQARABpAGMAdABpAG8AbgBhAHIAeQANAAoAIAAgAH0ADQAKACAAIAAjACAAMQBLAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADEASwAnAF0AWwAnADEAOgAxACcAXQAgACAAPQAgACcAMQAwADIANAB4ADEAMAAyADQAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAxAEsAJwBdAFsAJwA0ADoAMwAnAF0AIAAgAD0AIAAnADEAMQA1ADIAeAA4ADYANAAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADEASwAnAF0AWwAnADMAOgA0ACcAXQAgACAAPQAgACcAOAA2ADQAeAAxADEANQAyACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMQBLACcAXQBbACcAMQA2ADoAOQAnAF0AIAA9ACAAJwAxADIAOAAwAHgANwAyADAAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAxAEsAJwBdAFsAJwA5ADoAMQA2ACcAXQAgAD0AIAAnADcAMgAwAHgAMQAyADgAMAAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADEASwAnAF0AWwAnADMAOgAyACcAXQAgACAAPQAgACcAMQAyADQAOAB4ADgAMwAyACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMQBLACcAXQBbACcAMgA6ADMAJwBdACAAIAA9ACAAJwA4ADMAMgB4ADEAMgA0ADgAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAxAEsAJwBdAFsAJwAyADEAOgA5ACcAXQAgAD0AIAAnADEANQAxADIAeAA2ADQAOAAnAA0ACgAgACAAIwAgADIASwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAyAEsAJwBdAFsAJwAxADoAMQAnAF0AIAAgAD0AIAAnADIAMAA0ADgAeAAyADAANAA4ACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMgBLACcAXQBbACcANAA6ADMAJwBdACAAIAA9ACAAJwAyADMAMAA0AHgAMQA3ADIAOAAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADIASwAnAF0AWwAnADMAOgA0ACcAXQAgACAAPQAgACcAMQA3ADIAOAB4ADIAMwAwADQAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAyAEsAJwBdAFsAJwAxADYAOgA5ACcAXQAgAD0AIAAnADIAOAA0ADgAeAAxADYAMAAwACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMgBLACcAXQBbACcAOQA6ADEANgAnAF0AIAA9ACAAJwAxADYAMAAwAHgAMgA4ADQAOAAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADIASwAnAF0AWwAnADMAOgAyACcAXQAgACAAPQAgACcAMgA0ADkANgB4ADEANgA2ADQAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAyAEsAJwBdAFsAJwAyADoAMwAnAF0AIAAgAD0AIAAnADEANgA2ADQAeAAyADQAOQA2ACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMgBLACcAXQBbACcAMgAxADoAOQAnAF0AIAA9ACAAJwAzADEAMwA2AHgAMQAzADQANAAnAA0ACgAgACAAIwAgADMASwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAzAEsAJwBdAFsAJwAxADoAMQAnAF0AIAAgAD0AIAAnADMAMAA3ADIAeAAzADAANwAyACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMwBLACcAXQBbACcANAA6ADMAJwBdACAAIAA9ACAAJwAzADQANQA2AHgAMgA1ADkAMgAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADMASwAnAF0AWwAnADMAOgA0ACcAXQAgACAAPQAgACcAMgA1ADkAMgB4ADMANAA1ADYAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAzAEsAJwBdAFsAJwAxADYAOgA5ACcAXQAgAD0AIAAnADQAMAA5ADYAeAAyADMAMAA0ACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMwBLACcAXQBbACcAOQA6ADEANgAnAF0AIAA9ACAAJwAyADMAMAA0AHgANAAwADkANgAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADMASwAnAF0AWwAnADMAOgAyACcAXQAgACAAPQAgACcAMwA3ADQANAB4ADIANAA5ADYAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwAzAEsAJwBdAFsAJwAyADoAMwAnAF0AIAAgAD0AIAAnADIANAA5ADYAeAAzADcANAA0ACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcAMwBLACcAXQBbACcAMgAxADoAOQAnAF0AIAA9ACAAJwA0ADcAMAA0AHgAMgAwADEANgAnAA0ACgAgACAAIwAgADQASwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwA0AEsAJwBdAFsAJwAxADoAMQAnAF0AIAAgAD0AIAAnADQAMAA5ADYAeAA0ADAAOQA2ACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcANABLACcAXQBbACcANAA6ADMAJwBdACAAIAA9ACAAJwA0ADcAMAA0AHgAMwA1ADIAMAAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADQASwAnAF0AWwAnADMAOgA0ACcAXQAgACAAPQAgACcAMwA1ADIAMAB4ADQANwAwADQAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwA0AEsAJwBdAFsAJwAxADYAOgA5ACcAXQAgAD0AIAAnADUANQAwADQAeAAzADAANAAwACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcANABLACcAXQBbACcAOQA6ADEANgAnAF0AIAA9ACAAJwAzADAANAAwAHgANQA1ADAANAAnAA0ACgAgACAAJABTAEkAWgBFAF8ATQBBAFAAWwAnADQASwAnAF0AWwAnADMAOgAyACcAXQAgACAAPQAgACcANAA5ADkAMgB4ADMAMwAyADgAJwANAAoAIAAgACQAUwBJAFoARQBfAE0AQQBQAFsAJwA0AEsAJwBdAFsAJwAyADoAMwAnAF0AIAAgAD0AIAAnADMAMwAyADgAeAA0ADkAOQAyACcADQAKACAAIAAkAFMASQBaAEUAXwBNAEEAUABbACcANABLACcAXQBbACcAMgAxADoAOQAnAF0AIAA9ACAAJwA2ADIANAAwAHgAMgA2ADUANgAnAA0ACgAgACAAIwAgAM1TEVQifRVfGv9XAHgASAAgAC0APgAgAHsAcAByAGUAcwBlAHQAOwAgAHIAYQB0AGkAbwB9AA0ACgAgACAAJABXAFgASABfAEkATgBEAEUAWAAgAD0AIABAAHsAfQANAAoAIAAgAGYAbwByAGUAYQBjAGgAIAAoACQAcAByAGUAcwBlAHQAIABpAG4AIAAkAFMASQBaAEUAXwBNAEEAUAAuAEsAZQB5AHMAKQAgAHsADQAKACAAIAAgACAAZgBvAHIAZQBhAGMAaAAgACgAJAByAGEAdABpAG8AIABpAG4AIAAkAFMASQBaAEUAXwBNAEEAUABbACQAcAByAGUAcwBlAHQAXQAuAEsAZQB5AHMAKQAgAHsADQAKACAAIAAgACAAIAAgACQAdwB4AGgAIAA9ACAAJABTAEkAWgBFAF8ATQBBAFAAWwAkAHAAcgBlAHMAZQB0AF0AWwAkAHIAYQB0AGkAbwBdAA0ACgAgACAAIAAgACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAFcAWABIAF8ASQBOAEQARQBYAC4AQwBvAG4AdABhAGkAbgBzAEsAZQB5ACgAJAB3AHgAaAApACkAIAB7AA0ACgAgACAAIAAgACAAIAAgACAAJABfAF8AdwB4AGgATwBiAGoAIAA9ACAATgBlAHcALQBPAGIAagBlAGMAdAAgAFAAUwBPAGIAagBlAGMAdAANAAoAIAAgACAAIAAgACAAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAXwBfAHcAeABoAE8AYgBqACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAcAByAGUAcwBlAHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACQAcAByAGUAcwBlAHQAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIAAgACAAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAXwBfAHcAeABoAE8AYgBqACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAcgBhAHQAaQBvACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAkAHIAYQB0AGkAbwAgAC0ARgBvAHIAYwBlAA0ACgAgACAAIAAgACAAIAAgACAAJABXAFgASABfAEkATgBEAEUAWABbACQAdwB4AGgAXQAgAD0AIAAkAF8AXwB3AHgAaABPAGIAagANAAoAIAAgACAAIAAgACAAfQANAAoAIAAgACAAIAB9AA0ACgAgACAAfQANAAoAIAAgACMAIAD7i9ZTIABDAEwASQAgAJ9TH3UgAFMAZQBlAGQAcgBlAGEAbQAgAGNoTU8rANRri0/CU3BlCP+wZZ5YIAAtAC0AcwBlAGUAZAByAGUAYQBtAC0AcwBpAHoAZQAgAIxUIAAtAC0AcwBlAGUAZAByAGUAYQBtAC0AYQBzAHAAZQBjAHQALQByAGEAdABpAG8ACf8NAAoAIAAgACQAUwBpAHoAZQBGAHIAbwBtAFUAcwBlAHIAIAA9ACAAKABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHMAZQBlAGQAcgBlAGEAbQBzAGkAegBlACcAIAAnACcAKQAuAFQAcgBpAG0AKAApAC4AVABvAFUAcABwAGUAcgAoACkADQAKACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAFYAQQBMAEkARABfAFMASQBaAEUAUwAuAEMAbwBuAHQAYQBpAG4AcwAoACQAUwBpAHoAZQBGAHIAbwBtAFUAcwBlAHIAKQApACAAewAgACQAUwBpAHoAZQBGAHIAbwBtAFUAcwBlAHIAIAA9ACAAKABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHMAaQB6AGUAJwAgACcAJwApAC4AVAByAGkAbQAoACkALgBUAG8AVQBwAHAAZQByACgAKQAgAH0ADQAKACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAFYAQQBMAEkARABfAFMASQBaAEUAUwAuAEMAbwBuAHQAYQBpAG4AcwAoACQAUwBpAHoAZQBGAHIAbwBtAFUAcwBlAHIAKQApACAAewAgACQAUwBpAHoAZQBGAHIAbwBtAFUAcwBlAHIAIAA9ACAAJwAnACAAfQANAAoAIAAgACQAUgBhAHQAaQBvAEYAcgBvAG0AVQBzAGUAcgAgAD0AIAAoAEcAZQB0AC0ATgBvAHIAbQBWAGEAbAAgACcAcwBlAGUAZAByAGUAYQBtAGEAcwBwAGUAYwB0AHIAYQB0AGkAbwAnACAAJwAnACkALgBUAHIAaQBtACgAKQAgAC0AcgBlAHAAbABhAGMAZQAgACcAXABzACcALAAnACcADQAKACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAFYAQQBMAEkARABfAFIAQQBUAEkATwBTAC4AQwBvAG4AdABhAGkAbgBzACgAJABSAGEAdABpAG8ARgByAG8AbQBVAHMAZQByACkAKQAgAHsAIAAkAFIAYQB0AGkAbwBGAHIAbwBtAFUAcwBlAHIAIAA9ACAAKABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAGEAcwBwAGUAYwB0AHIAYQB0AGkAbwAnACAAJwAnACkALgBUAHIAaQBtACgAKQAgAC0AcgBlAHAAbABhAGMAZQAgACcAXABzACcALAAnACcAIAB9AA0ACgAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABWAEEATABJAEQAXwBSAEEAVABJAE8AUwAuAEMAbwBuAHQAYQBpAG4AcwAoACQAUgBhAHQAaQBvAEYAcgBvAG0AVQBzAGUAcgApACkAIAB7ACAAJABSAGEAdABpAG8ARgByAG8AbQBVAHMAZQByACAAPQAgACcAJwAgAH0ADQAKACAAIAAkAE0AYQB0AGMAaABlAGQAUAByAGUAcwBlAHQAIAA9ACAAJwAnADsAIAAkAE0AYQB0AGMAaABlAGQAUgBhAHQAaQBvACAAPQAgACcAJwANAAoAIAAgAGkAZgAgACgAJABTAGkAegBlAEYAcgBvAG0AVQBzAGUAcgAgAC0AYQBuAGQAIAAkAFIAYQB0AGkAbwBGAHIAbwBtAFUAcwBlAHIAKQAgAHsADQAKACAAIAAgACAAJABNAGEAdABjAGgAZQBkAFAAcgBlAHMAZQB0ACAAPQAgACQAUwBpAHoAZQBGAHIAbwBtAFUAcwBlAHIAOwAgACQATQBhAHQAYwBoAGUAZABSAGEAdABpAG8AIAA9ACAAJABSAGEAdABpAG8ARgByAG8AbQBVAHMAZQByAA0ACgAgACAAfQAgAGUAbABzAGUAIAB7AA0ACgAgACAAIAAgACQASABhAHMAVwAgAD0AIAAoACQAbgB1AGwAbAAgAC0AbgBlACAAJABSAGEAdwBXAGkAZAB0AGgAKQA7ACAAJABIAGEAcwBIACAAPQAgACgAJABuAHUAbABsACAALQBuAGUAIAAkAFIAYQB3AEgAZQBpAGcAaAB0ACkADQAKACAAIAAgACAAaQBmACAAKAAkAEgAYQBzAFcAIAAtAG8AcgAgACQASABhAHMASAApACAAewANAAoAIAAgACAAIAAgACAAIwAgAB1c1YsgADEAGv++fG54IABXAHgASAAgAH1ULU4b/+WC6lMJZwBOuY8ZUiIAOn+EdgBOuY8JYyAAMQA6ADEAIADRjzxPCP9Je45O8l3ld4R2o5AATrmPCf8iAI1REpBSXzlTTZEM/3+QTVEgAEcAdQBlAHMAcwAgADEAMAAwADAAIAAgkBBiYpfveU5PME8CMA0ACgAgACAAIAAgACAAIAAkAEcAdQBlAHMAcwBXACAAPQAgAGkAZgAgACgAJABIAGEAcwBXACkAIAB7ACAAJABSAGEAdwBXAGkAZAB0AGgAIAB9ACAAZQBsAHMAZQAgAHsAIAAwACAAfQANAAoAIAAgACAAIAAgACAAJABHAHUAZQBzAHMASAAgAD0AIABpAGYAIAAoACQASABhAHMASAApACAAewAgACQAUgBhAHcASABlAGkAZwBoAHQAIAB9ACAAZQBsAHMAZQAgAHsAIAAwACAAfQANAAoAIAAgACAAIAAgACAAaQBmACAAKAAoACQARwB1AGUAcwBzAFcAIAAtAGcAdAAgADAAKQAgAC0AeABvAHIAIAAoACQARwB1AGUAcwBzAEgAIAAtAGcAdAAgADAAKQApACAAewANAAoAIAAgACAAIAAgACAAIAAgACQAawBuAG8AdwBuAFMAaQBkAGUAIAA9ACAAWwBNAGEAdABoAF0AOgA6AE0AYQB4ACgAJABHAHUAZQBzAHMAVwAsACAAJABHAHUAZQBzAHMASAApAA0ACgAgACAAIAAgACAAIAAgACAAJABHAHUAZQBzAHMAVwAgAD0AIAAkAGsAbgBvAHcAbgBTAGkAZABlADsAIAAkAEcAdQBlAHMAcwBIACAAPQAgACQAawBuAG8AdwBuAFMAaQBkAGUADQAKACAAIAAgACAAIAAgAH0ADQAKACAAIAAgACAAIAAgACQARQB4AGEAYwB0AEsAZQB5ACAAPQAgACIAJAB7AEcAdQBlAHMAcwBXAH0AeAAkAHsARwB1AGUAcwBzAEgAfQAiAA0ACgAgACAAIAAgACAAIABpAGYAIAAoACQAVwBYAEgAXwBJAE4ARABFAFgALgBDAG8AbgB0AGEAaQBuAHMASwBlAHkAKAAkAEUAeABhAGMAdABLAGUAeQApACkAIAB7AA0ACgAgACAAIAAgACAAIAAgACAAJABNAGEAdABjAGgAZQBkAFAAcgBlAHMAZQB0ACAAPQAgACQAVwBYAEgAXwBJAE4ARABFAFgAWwAkAEUAeABhAGMAdABLAGUAeQBdAC4AcAByAGUAcwBlAHQADQAKACAAIAAgACAAIAAgACAAIAAkAE0AYQB0AGMAaABlAGQAUgBhAHQAaQBvACAAPQAgACQAVwBYAEgAXwBJAE4ARABFAFgAWwAkAEUAeABhAGMAdABLAGUAeQBdAC4AcgBhAHQAaQBvAA0ACgAgACAAIAAgACAAIAB9ACAAZQBsAHMAZQAgAHsADQAKACAAIAAgACAAIAAgACAAIAAjACAAUwB0AHIAYQB0AGUAZwB5ACAAQQA6ACAAcABpAGMAawAgAHMAbQBhAGwAbABlAHMAdAAgAGEAcgBlAGEAIABkAGkAZgBmACAAYQBtAG8AbgBnACAAcAByAGUAcwBlAHQAcwAgAHcAaABvAHMAZQAgAE8ARgBGAEkAQwBJAEEATAAgAFIAQQBUAEkATwAgAG0AYQB0AGMAaABlAHMAIAB0AGgAZQAgAHMAaQBtAHAAbABpAGYAaQBlAGQAIAByAGEAdABpAG8ALgANAAoAIAAgACAAIAAgACAAIAAgACMAIAAoAFQAaABpAHMAIABnAGkAdgBlAHMAIABoAGkAZwBoAGUAcwB0ACAAcAByAGkAbwByAGkAdAB5ACAAdwBoAGUAbgAgAGUALgBnAC4AIAB1AHMAZQByACAAcABhAHMAcwBlAHMAIAAxADkAMgAwAHgAMQAwADgAMAAgAC0APgAgADEANgA6ADkAIABvAGYAZgBpAGMAaQBhAGwAIABlAG4AdQBtACkADQAKACAAIAAgACAAIAAgACAAIABmAHUAbgBjAHQAaQBvAG4AIABfAEcAQwBEACgAJABhACwAIAAkAGIAKQAgAHsAIABpAGYAIAAoACQAYgAgAC0AZQBxACAAMAApACAAewAgAHIAZQB0AHUAcgBuACAAJABhACAAfQAgAHIAZQB0AHUAcgBuACAAXwBHAEMARAAgACQAYgAgACgAJABhACAAJQAgACQAYgApACAAfQANAAoAIAAgACAAIAAgACAAIAAgACQARwAgAD0AIABfAEcAYwBkACAAJABHAHUAZQBzAHMAVwAgACQARwB1AGUAcwBzAEgADQAKACAAIAAgACAAIAAgACAAIAAkAFMAaQBtAHAAbABlAFIAYQB0AGkAbwAgAD0AIABpAGYAIAAoACQARwAgAC0AZwB0ACAAMAApACAAewAgACIAewAwAH0AOgB7ADEAfQAiACAALQBmACAAWwBNAGEAdABoAF0AOgA6AEYAbABvAG8AcgAoACQARwB1AGUAcwBzAFcAIAAvACAAJABHACkALAAgAFsATQBhAHQAaABdADoAOgBGAGwAbwBvAHIAKAAkAEcAdQBlAHMAcwBIACAALwAgACQARwApACAAfQAgAGUAbABzAGUAIAB7ACAAJwAnACAAfQANAAoAIAAgACAAIAAgACAAIAAgACQAQgBlAHMAdAAgAD0AIAAkAG4AdQBsAGwADQAKACAAIAAgACAAIAAgACAAIABmAG8AcgBlAGEAYwBoACAAKAAkAFAAcgBlAHMAZQB0AEsAZQB5ACAAaQBuACAAJABTAEkAWgBFAF8ATQBBAFAALgBLAGUAeQBzACkAIAB7AA0ACgAgACAAIAAgACAAIAAgACAAIAAgAGYAbwByAGUAYQBjAGgAIAAoACQAUgBhAHQAaQBvAEsAZQB5ACAAaQBuACAAJABTAEkAWgBFAF8ATQBBAFAAWwAkAFAAcgBlAHMAZQB0AEsAZQB5AF0ALgBLAGUAeQBzACkAIAB7AA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIABpAGYAIAAoACQAUwBpAG0AcABsAGUAUgBhAHQAaQBvACAALQBhAG4AZAAgACQAUgBhAHQAaQBvAEsAZQB5ACAALQBuAGUAIAAkAFMAaQBtAHAAbABlAFIAYQB0AGkAbwApACAAewAgAGMAbwBuAHQAaQBuAHUAZQAgAH0ADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACQAUwB0AGEAbgBkAGEAcgBkACAAPQAgACQAUwBJAFoARQBfAE0AQQBQAFsAJABQAHIAZQBzAGUAdABLAGUAeQBdAFsAJABSAGEAdABpAG8ASwBlAHkAXQANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABQAGEAcgB0AHMAIAA9ACAAJABTAHQAYQBuAGQAYQByAGQAIAAtAHMAcABsAGkAdAAgACcAeAAnAA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAkAFMAdwAgAD0AIABbAGkAbgB0AF0AJABQAGEAcgB0AHMAWwAwAF0AOwAgACQAUwBoACAAPQAgAFsAaQBuAHQAXQAkAFAAYQByAHQAcwBbADEAXQANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABEAGkAZgBmACAAPQAgAFsATQBhAHQAaABdADoAOgBBAGIAcwAoACgAJABHAHUAZQBzAHMAVwAgACoAIAAkAEcAdQBlAHMAcwBIACkAIAAtACAAKAAkAFMAdwAgACoAIAAkAFMAaAApACkADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACQAQwB1AHIAIAA9ACAATgBlAHcALQBPAGIAagBlAGMAdAAgAFAAUwBPAGIAagBlAGMAdAANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAQwB1AHIAIAAgACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAJwBwAHIAZQBzAGUAdAAnACAAIAAgACAAIAAgACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAFAAcgBlAHMAZQB0AEsAZQB5ACkAIAAgACAAIAAgACAAIAAgACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAEMAdQByACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcgBhAHQAaQBvACcAIAAgACAAIAAgACAAIAAgACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAoACQAUgBhAHQAaQBvAEsAZQB5ACkAIAAgACAAIAAgACAAIAAgACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAEMAdQByACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAZABpAGYAZgAnACAAIAAgACAAIAAgACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAEQAaQBmAGYAKQAgACAAIAAgACAAIAAgACAAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAaQBmACAAKAAoACQAbgB1AGwAbAAgAC0AZQBxACAAJABCAGUAcwB0ACkAIAAtAG8AcgAgACgAJABDAHUAcgAuAGQAaQBmAGYAIAAtAGwAdAAgACQAQgBlAHMAdAAuAGQAaQBmAGYAKQApACAAewAgACQAQgBlAHMAdAAgAD0AIAAkAEMAdQByACAAfQANAAoAIAAgACAAIAAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgACAAIAAgACAAfQANAAoAIAAgACAAIAAgACAAIAAgACMAIABTAHQAcgBhAHQAZQBnAHkAIABCADoAIABpAGYAIABTAGkAbQBwAGwAZQBSAGEAdABpAG8AIABpAHMAIABOAE8AVAAgAGkAbgAgAHQAaABlACAAbwBmAGYAaQBjAGkAYQBsACAAZQBuAHUAbQAgAHMAZQB0ACAAKABlAC4AZwAuACAAMQAyADAAMAB4ADcAMAAwACAALQA+ACAAMQAyADoANwApACwADQAKACAAIAAgACAAIAAgACAAIAAjACAAdABoAGUAIABsAG8AbwBwACAAYQBiAG8AdgBlACAAdwBpAGwAbAAgAHAAcgBvAGQAdQBjAGUAIABuAG8AIABjAGEAbgBkAGkAZABhAHQAZQAgACgAYwBvAG4AdABpAG4AdQBlAC0AZgBpAGwAdABlAHIAZQBkACAAZQB2AGUAcgB5AHQAaABpAG4AZwApAC4ADQAKACAAIAAgACAAIAAgACAAIAAjACAARgBhAGwAbABiAGEAYwBrADoAIABpAHQAZQByAGEAdABlACAAQQBMAEwAIAA0ACoAOAA9ADMAMgAgAHAAcgBlAHMAZQB0AHMAIABXAEkAVABIAE8AVQBUACAAcgBhAHQAaQBvACAAZgBpAGwAdABlAHIALAAgAHAAaQBjAGsAIABzAG0AYQBsAGwAZQBzAHQAIABhAHIAZQBhACAAZABpAGYAZgAuAA0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAG4AdQBsAGwAIAAtAGUAcQAgACQAQgBlAHMAdAApACAAewANAAoAIAAgACAAIAAgACAAIAAgACAAIABmAG8AcgBlAGEAYwBoACAAKAAkAFAAcgBlAHMAZQB0AEsAZQB5ACAAaQBuACAAJABTAEkAWgBFAF8ATQBBAFAALgBLAGUAeQBzACkAIAB7AA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIABmAG8AcgBlAGEAYwBoACAAKAAkAFIAYQB0AGkAbwBLAGUAeQAgAGkAbgAgACQAUwBJAFoARQBfAE0AQQBQAFsAJABQAHIAZQBzAGUAdABLAGUAeQBdAC4ASwBlAHkAcwApACAAewANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACQAUwB0AGEAbgBkAGEAcgBkACAAPQAgACQAUwBJAFoARQBfAE0AQQBQAFsAJABQAHIAZQBzAGUAdABLAGUAeQBdAFsAJABSAGEAdABpAG8ASwBlAHkAXQANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACQAUABhAHIAdABzACAAPQAgACQAUwB0AGEAbgBkAGEAcgBkACAALQBzAHAAbABpAHQAIAAnAHgAJwANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACQAUwB3ACAAPQAgAFsAaQBuAHQAXQAkAFAAYQByAHQAcwBbADAAXQA7ACAAJABTAGgAIAA9ACAAWwBpAG4AdABdACQAUABhAHIAdABzAFsAMQBdAA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABEAGkAZgBmACAAPQAgAFsATQBhAHQAaABdADoAOgBBAGIAcwAoACgAJABHAHUAZQBzAHMAVwAgACoAIAAkAEcAdQBlAHMAcwBIACkAIAAtACAAKAAkAFMAdwAgACoAIAAkAFMAaAApACkADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAkAEMAdQByACAAPQAgAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABQAFMATwBiAGoAZQBjAHQADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAQwB1AHIAIAAgACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcAByAGUAcwBlAHQAJwAgACAAIAAgACAAIAAgACAAIAAgACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAoACQAUAByAGUAcwBlAHQASwBlAHkAKQAgACAAIAAgACAAIAAgACAAIAAgACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAQwB1AHIAIAAgACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcgBhAHQAaQBvACcAIAAgACAAIAAgACAAIAAgACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAFIAYQB0AGkAbwBLAGUAeQApACAAIAAgACAAIAAgACAAIAAgACAAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABDAHUAcgAgACAAIAAgACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAJwBkAGkAZgBmACcAIAAgACAAIAAgACAAIAAgACAAIAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAEQAaQBmAGYAKQAgACAAIAAgACAAIAAgACAAIAAgACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABpAGYAIAAoACgAJABuAHUAbABsACAALQBlAHEAIAAkAEIAZQBzAHQAKQAgAC0AbwByACAAKAAkAEMAdQByAC4AZABpAGYAZgAgAC0AbAB0ACAAJABCAGUAcwB0AC4AZABpAGYAZgApACkAIAB7ACAAJABCAGUAcwB0ACAAPQAgACQAQwB1AHIAIAB9AA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgACAAIAAgACAAIAAgAH0ADQAKACAAIAAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAG4AdQBsAGwAIAAtAG4AZQAgACQAQgBlAHMAdAApACAAewANAAoAIAAgACAAIAAgACAAIAAgACAAIAAkAE0AYQB0AGMAaABlAGQAUAByAGUAcwBlAHQAIAA9ACAAJABCAGUAcwB0AC4AcAByAGUAcwBlAHQADQAKACAAIAAgACAAIAAgACAAIAAgACAAJABNAGEAdABjAGgAZQBkAFIAYQB0AGkAbwAgAD0AIAAkAEIAZQBzAHQALgByAGEAdABpAG8ADQAKACAAIAAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgAH0AIABlAGwAcwBlAGkAZgAgACgAJABSAGEAdABpAG8ARgByAG8AbQBVAHMAZQByACkAIAB7AA0ACgAgACAAIAAgACAAIAAkAE0AYQB0AGMAaABlAGQAUAByAGUAcwBlAHQAIAA9ACAAJwAyAEsAJwA7ACAAJABNAGEAdABjAGgAZQBkAFIAYQB0AGkAbwAgAD0AIAAkAFIAYQB0AGkAbwBGAHIAbwBtAFUAcwBlAHIADQAKACAAIAAgACAAfQAgAGUAbABzAGUAaQBmACAAKAAkAFMAaQB6AGUARgByAG8AbQBVAHMAZQByACkAIAB7AA0ACgAgACAAIAAgACAAIAAkAE0AYQB0AGMAaABlAGQAUAByAGUAcwBlAHQAIAA9ACAAJABTAGkAegBlAEYAcgBvAG0AVQBzAGUAcgA7ACAAJABNAGEAdABjAGgAZQBkAFIAYQB0AGkAbwAgAD0AIAAnADEAOgAxACcADQAKACAAIAAgACAAfQAgAGUAbABzAGUAIAB7AA0ACgAgACAAIAAgACAAIAAkAE0AYQB0AGMAaABlAGQAUAByAGUAcwBlAHQAIAA9ACAAJwAyAEsAJwA7ACAAJABNAGEAdABjAGgAZQBkAFIAYQB0AGkAbwAgAD0AIAAnADEAOgAxACcADQAKACAAIAAgACAAfQANAAoAIAAgAH0ADQAKACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAFYAQQBMAEkARABfAFMASQBaAEUAUwAuAEMAbwBuAHQAYQBpAG4AcwAoACQATQBhAHQAYwBoAGUAZABQAHIAZQBzAGUAdAApACkAIAB7ACAAJABNAGEAdABjAGgAZQBkAFAAcgBlAHMAZQB0ACAAPQAgACcAMgBLACcAIAB9AA0ACgAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABWAEEATABJAEQAXwBSAEEAVABJAE8AUwAuAEMAbwBuAHQAYQBpAG4AcwAoACQATQBhAHQAYwBoAGUAZABSAGEAdABpAG8AKQApACAAewAgACQATQBhAHQAYwBoAGUAZABSAGEAdABpAG8AIAA9ACAAJwAxADoAMQAnACAAfQANAAoAIAAgACMAIACZUWVR3YT+Vp9TH3UgAFMAZQBlAGQAcgBlAGEAbQAgAFdbtWsI/w5O3YT+VoKCuXCVXuiQwlNwZWKXf2cATvSBCf8CMA0ACgAgACAAIwAgAFZ7ZXUa/0MATABJACAA9HalY9BjpE4gAFMAZQBlAGQAcgBlAGEAbQAgAJ9TH3WaZz5OV1u1awj/cwBlAGUAZAByAGUAYQBtAFMAaQB6AGUAIAArACAAcwBlAGUAZAByAGUAYQBtAEEAcwBwAGUAYwB0AFIAYQB0AGkAbwAgACsAIABzAGUAZQBkAHIAZQBhAG0AUQB1AGEAbgB0AGkAdAB5AAn/DP8NAAoAIAAgACMAIAAgACAAIAAgACAAIAANTo1R3laZUSAAdwBpAGQAdABoAC8AaABlAGkAZwBoAHQAIAAWYpdRWU8rUg1UCP9zAGkAegBlAC8AYQBzAHAAZQBjAHQAXwByAGEAdABpAG8ALwBhAHMAcABlAGMAdAAgAEl7Cf8M/92E/lYvAHMAZQByAHYAaQBjAGUAIABCXBpP+leOTtmPm06fUx91V1u1a99+AE7jiZBnAjANAAoAIAAgACMAIAAgACAAIAAgACAAIADdT1l1IAB3AGkAZAB0AGgALwBoAGUAaQBnAGgAdAAvAGEAcwBwAGUAYwB0AFIAYQB0AGkAbwAgAEl7IABsAGUAZwBhAGMAeQAgAFdbtWvFTlNfKHU3Yj5mD18gT2VR9mXdT1l1CP8oV4dl9k4AXzRZIABMADEAMgAtAEwAMQA3ACAA8l2MWxBiCf8M/w0ACgAgACAAIwAgACAAIAAgACAAIAAgAEZPDU47TqhSzk4gAFMASQBaAEUAXwBNAEEAUAAgAM1TqGOZUWVRDP9/kE1RCU5CXCAAKABjAGwAaQAvAHMAZQByAHYAaQBjAGUALwBiAHUAaQBsAHQAaQBuAFQAbwBvAGwAcwApACAAzZENWWJjl3unTh91Am/7eQIwDQAKACAAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHMAZQBlAGQAcgBlAGEAbQBTAGkAegBlACcAXQAgAD0AIAAkAE0AYQB0AGMAaABlAGQAUAByAGUAcwBlAHQADQAKACAAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHMAZQBlAGQAcgBlAGEAbQBBAHMAcABlAGMAdABSAGEAdABpAG8AJwBdACAAPQAgACQATQBhAHQAYwBoAGUAZABSAGEAdABpAG8ADQAKACAAIAAjACAAUwBlAGUAZAByAGUAYQBtACAAcQB1AGEAbgB0AGkAdAB5AAj/3YT+Vhr/MQAvADIALwA0AAn/FCAUIEMATABJACAA2J6kiyAAMQAM/wBnJ1k8UCAANAANAAoAIAAgAGkAZgAgACgAJABuAHUAbABsACAALQBuAGUAIAAkAFIAYQB3AEkAbQBhAGcAZQBDAG8AdQBuAHQAKQAgAHsADQAKACAAIAAgACAAJABOAG8AcgBtAE4AIAA9ACAAWwBNAGEAdABoAF0AOgA6AE0AaQBuACgANAAsACAAWwBNAGEAdABoAF0AOgA6AE0AYQB4ACgAMQAsACAAWwBpAG4AdABdACQAUgBhAHcASQBtAGEAZwBlAEMAbwB1AG4AdAApACkADQAKACAAIAB9ACAAZQBsAHMAZQAgAHsADQAKACAAIAAgACAAJABWADIAIAA9ACAARwBlAHQALQBOAG8AcgBtAFYAYQBsACAAJwBzAGUAZQBkAHIAZQBhAG0AcQB1AGEAbgB0AGkAdAB5ACcAOwAgAGkAZgAgACgAJABuAHUAbABsACAALQBuAGUAIAAkAFYAMgApACAAewAgACQATgBvAHIAbQBOACAAPQAgAFsATQBhAHQAaABdADoAOgBNAGkAbgAoADQALAAgAFsATQBhAHQAaABdADoAOgBNAGEAeAAoADEALAAgAFsAaQBuAHQAXQAkAFYAMgApACkAIAB9ACAAZQBsAHMAZQAgAHsAIAAkAE4AbwByAG0ATgAgAD0AIAAxACAAfQANAAoAIAAgAH0ADQAKACAAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHMAZQBlAGQAcgBlAGEAbQBRAHUAYQBuAHQAaQB0AHkAJwBdACAAPQAgACQATgBvAHIAbQBOAA0ACgAgACAAIwAgAGkAbQBhAGcAZQBDAG8AdQBuAHQAGv9uAG8AbgAtAHMAZQBlAGQAcgBlAGEAbQAgAAOMKHW5ZfuL1lMb/yh1N2I+Zg9fIE/2ZSAATAAxADcAIADyXZlRZVEM/yZUGVJliNiepIsNAAoAIAAgAGkAZgAgACgALQBuAG8AdAAgACQAUABhAHkAbABvAGEAZAAuAEMAbwBuAHQAYQBpAG4AcwAoACcAaQBtAGEAZwBlAEMAbwB1AG4AdAAnACkAKQAgAHsAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAGkAbQBhAGcAZQBDAG8AdQBuAHQAJwBdACAAPQAgACQATgBvAHIAbQBOACAAfQANAAoAIAAgACQAUABhAHkAbABvAGEAZABbACcAcwBlAGUAZAByAGUAYQBtAFcAYQB0AGUAcgBtAGEAcgBrACcAXQAgAD0AIAAkAGYAYQBsAHMAZQANAAoAIAAgACQAVgAgAD0AIABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHMAZQBlAGQAcgBlAGEAbQB3AGEAdABlAHIAbQBhAHIAawAnADsAIABpAGYAIAAoACQAbgB1AGwAbAAgAC0AbgBlACAAJABWACkAIAB7ACAAJABXAG0ARgBsAGEAZwAgAD0AIAAoACIAJABWACIAIAAtAG0AYQB0AGMAaAAgACcAXgAoADEAfAB0AHIAdQBlAHwAeQBlAHMAfABvAG4AKQAkACcAKQA7ACAAJABQAGEAeQBsAG8AYQBkAFsAJwBzAGUAZQBkAHIAZQBhAG0AVwBhAHQAZQByAG0AYQByAGsAJwBdACAAPQAgACQAVwBtAEYAbABhAGcAIAB9AA0ACgAgACAAIwAgAFMAZQBlAGQAcgBlAGEAbQAgAG8AdQB0AHAAdQB0ACAAZgBvAHIAbQBhAHQACP/dhP5W2J6kiyAAagBwAGUAZwAJ/w0ACgAgACAAJABPAHUAdABGAG0AdAAgAD0AIAAnAGoAcABlAGcAJwANAAoAIAAgACQAVgAgAD0AIABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHMAZQBlAGQAcgBlAGEAbQBvAHUAdABwAHUAdABmAG8AcgBtAGEAdAAnADsAIABpAGYAIAAoACQAbgB1AGwAbAAgAC0AbgBlACAAJABWACkAIAB7ACAAJABGACAAPQAgACgAIgAkAFYAIgApAC4AVAByAGkAbQAoACkALgBUAG8ATABvAHcAZQByACgAKQA7ACAAaQBmACAAKAAkAEYAIAAtAGUAcQAgACcAcABuAGcAJwAgAC0AbwByACAAJABGACAALQBlAHEAIAAnAGoAcABlAGcAJwApACAAewAgACQATwB1AHQARgBtAHQAIAA9ACAAJABGACAAfQAgAH0ADQAKACAAIAAkAFYAIAA9ACAARwBlAHQALQBOAG8AcgBtAFYAYQBsACAAJwBvAHUAdABwAHUAdABmAG8AcgBtAGEAdAAnADsAIABpAGYAIAAoACQAbgB1AGwAbAAgAC0AbgBlACAAJABWACkAIAB7ACAAJABGACAAPQAgACgAIgAkAFYAIgApAC4AVAByAGkAbQAoACkALgBUAG8ATABvAHcAZQByACgAKQA7ACAAaQBmACAAKAAkAEYAIAAtAGUAcQAgACcAcABuAGcAJwAgAC0AbwByACAAJABGACAALQBlAHEAIAAnAGoAcABlAGcAJwApACAAewAgACQATwB1AHQARgBtAHQAIAA9ACAAJABGACAAfQAgAH0ADQAKACAAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHMAZQBlAGQAcgBlAGEAbQBPAHUAdABwAHUAdABGAG8AcgBtAGEAdAAnAF0AIAA9ACAAJABPAHUAdABGAG0AdAANAAoAIAAgACQAUABhAHkAbABvAGEAZABbACcAcwBlAGUAZAByAGUAYQBtAFMAZQBlAGQAJwBdACAAPQAgAC0AMQANAAoAIAAgACQAVgAgAD0AIABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHMAZQBlAGQAcgBlAGEAbQBzAGUAZQBkACcAOwAgAGkAZgAgACgAJABuAHUAbABsACAALQBuAGUAIAAkAFYAKQAgAHsAIAAkAFMAZQBlAGQAVgBhAGwAIAA9ACAAWwBpAG4AdABdACQAVgA7ACAAaQBmACAAKAAkAFMAZQBlAGQAVgBhAGwAIAAtAGcAZQAgADAAKQAgAHsAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHMAZQBlAGQAcgBlAGEAbQBTAGUAZQBkACcAXQAgAD0AIAAkAFMAZQBlAGQAVgBhAGwAIAB9ACAAfQANAAoAIAAgACQAVgAgAD0AIABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHMAZQBlAGQAJwA7ACAAaQBmACAAKAAkAG4AdQBsAGwAIAAtAG4AZQAgACQAVgApACAAewAgACQAUwBlAGUAZABWAGEAbAAgAD0AIABbAGkAbgB0AF0AJABWADsAIABpAGYAIAAoACQAUwBlAGUAZABWAGEAbAAgAC0AZwBlACAAMAApACAAewAgACQAUABhAHkAbABvAGEAZABbACcAcwBlAGUAZAByAGUAYQBtAFMAZQBlAGQAJwBdACAAPQAgACQAUwBlAGUAZABWAGEAbAAgAH0AIAB9AA0ACgAgACAAIwAgAD0APQA9AD0APQAgAE0AbwBkAGUAbAAgAC8AIABFAG4AZABwAG8AaQBuAHQAIAByAGUAcwBvAGwAdQB0AGkAbwBuACAAKABhAGwAaQBnAG4AcwAgAHcAaQB0AGgAIABiAGwAdQBlAHAAcgBpAG4AdAAgAG4AbwBkAGUAIABkAGkAYQBsAG8AZwAgACIAUwBlAGUAZAByAGUAYQBtACAAbQBvAGQAZQBsACIAIABkAHIAbwBwAGQAbwB3AG4AKQAgAD0APQA9AD0APQANAAoAIAAgACMAIABQAHIAaQBvAHIAaQB0AHkAOgAgAC0ALQBzAGUAZQBkAHIAZQBhAG0ALQBlAG4AZABwAG8AaQBuAHQAIAA+ACAALQAtAHMAZQBlAGQAcgBlAGEAbQAtAG0AbwBkAGUAbAAtAHYAZQByAHMAaQBvAG4AIAA+ACAALQAtAG0AbwBkAGUAbAAgACgAdgBhAGwAaQBkACAAZQBuAGQAcABvAGkAbgB0ACkAIAA+ACAARABFAEYAQQBVAEwAVAAgAGQAbwB1AGIAYQBvAC0AcwBlAGUAZAByAGUAYQBtAC0ANAAtADUALQAyADUAMQAxADIAOAANAAoAIAAgACQAUgBhAHcARQBuAGQAcABvAGkAbgB0ACAAPQAgACgARwBlAHQALQBOAG8AcgBtAFYAYQBsACAAJwBzAGUAZQBkAHIAZQBhAG0AZQBuAGQAcABvAGkAbgB0ACcAIAAnACcAKQAuAFQAcgBpAG0AKAApAA0ACgAgACAAaQBmACAAKABbAHMAdAByAGkAbgBnAF0AOgA6AEkAcwBOAHUAbABsAE8AcgBXAGgAaQB0AGUAUwBwAGEAYwBlACgAJABSAGEAdwBFAG4AZABwAG8AaQBuAHQAKQApACAAewAgACQAUgBhAHcARQBuAGQAcABvAGkAbgB0ACAAPQAgACgARwBlAHQALQBOAG8AcgBtAFYAYQBsACAAJwBzAGUAZQBkAHIAZQBhAG0AbQBvAGQAZQBsAHYAZQByAHMAaQBvAG4AJwAgACcAJwApAC4AVAByAGkAbQAoACkAIAB9AA0ACgAgACAAJABSAGEAdwBNAG8AZABlAGwAIAA9ACAAKABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAG0AbwBkAGUAbAAnACAAJwAnACkALgBUAHIAaQBtACgAKQANAAoAIAAgACMAIABJAGYAIAAtAC0AbQBvAGQAZQBsACAAaQBzACAAYQAgAHIAZQBhAGwAIABlAG4AZABwAG8AaQBuAHQALQBsAGkAawBlACAAdgBhAGwAdQBlACAAKABjAG8AbgB0AGEAaQBuAHMAIAAnAC0AJwAvACcAXwAnACAAbwByACAAcwB0AGEAcgB0AHMAIAB3AGkAdABoACAAJwBlAHAALQAnACkAIAB1AHMAZQAgAGkAdAA7ACAAbwB0AGgAZQByAHcAaQBzAGUAIAB0AHIAZQBhAHQAIABpAHQAIABhAHMAIAB0AGgAZQAgAHAAcgBvAHYAaQBkAGUAcgAgAGYAaQBlAGwAZAAuAA0ACgAgACAAJABMAG8AbwBrAHMATABpAGsAZQBSAGUAYQBsAEUAbgBkAHAAbwBpAG4AdAAgAD0AIAAkAGYAYQBsAHMAZQANAAoAIAAgAGkAZgAgACgALQBuAG8AdAAgAFsAcwB0AHIAaQBuAGcAXQA6ADoASQBzAE4AdQBsAGwATwByAFcAaABpAHQAZQBTAHAAYQBjAGUAKAAkAFIAYQB3AE0AbwBkAGUAbAApACkAIAB7AA0ACgAgACAAIAAgAGkAZgAgACgAJABSAGEAdwBNAG8AZABlAGwAIAAtAG0AYQB0AGMAaAAgACcAXgAoAGUAcAAtAHwAZABvAHUAYgBhAG8ALQB8AHMAZQBlAGQAcgBlAGEAbQAtAHwAagBpAG0AZQBuAGcALQB8AHMAZQBlAGQAYQBuAGMAZQAtAHwAYgB5AHQAZQBkAGEAbgBjAGUALQB8AHYAbwBsAGMALQApACcAKQAgAHsAIAAkAEwAbwBvAGsAcwBMAGkAawBlAFIAZQBhAGwARQBuAGQAcABvAGkAbgB0ACAAPQAgACQAdAByAHUAZQAgAH0ADQAKACAAIAAgACAAZQBsAHMAZQBpAGYAIAAoACQAUgBhAHcATQBvAGQAZQBsACAALQBtAGEAdABjAGgAIAAnAFsALQBfAF0AJwAgAC0AYQBuAGQAIAAkAFIAYQB3AE0AbwBkAGUAbAAuAEwAZQBuAGcAdABoACAALQBnAGUAIAAxADAAKQAgAHsAIAAkAEwAbwBvAGsAcwBMAGkAawBlAFIAZQBhAGwARQBuAGQAcABvAGkAbgB0ACAAPQAgACQAdAByAHUAZQAgAH0ADQAKACAAIAB9AA0ACgAgACAAJABGAGkAbgBhAGwARQBuAGQAcABvAGkAbgB0ACAAPQAgACcAJwANAAoAIAAgAGkAZgAgACgALQBuAG8AdAAgAFsAcwB0AHIAaQBuAGcAXQA6ADoASQBzAE4AdQBsAGwATwByAFcAaABpAHQAZQBTAHAAYQBjAGUAKAAkAFIAYQB3AEUAbgBkAHAAbwBpAG4AdAApACkAIAB7AA0ACgAgACAAIAAgACQARgBpAG4AYQBsAEUAbgBkAHAAbwBpAG4AdAAgAD0AIAAkAFIAYQB3AEUAbgBkAHAAbwBpAG4AdAANAAoAIAAgAH0AIABlAGwAcwBlAGkAZgAgACgAJABMAG8AbwBrAHMATABpAGsAZQBSAGUAYQBsAEUAbgBkAHAAbwBpAG4AdAApACAAewANAAoAIAAgACAAIAAkAEYAaQBuAGEAbABFAG4AZABwAG8AaQBuAHQAIAA9ACAAJABSAGEAdwBNAG8AZABlAGwADQAKACAAIAB9ACAAZQBsAHMAZQAgAHsADQAKACAAIAAgACAAIwAgAEQAZQBmAGEAdQBsAHQAOgAgAHUAcwBlACAAdABoAGUAIABzAGEAbQBlACAAZABlAGYAYQB1AGwAdAAgAGEAcwAgAHQAaABlACAAYgBsAHUAZQBwAHIAaQBuAHQAIABuAG8AZABlACAAcABhAHIAYQBtAGUAdABlAHIAIABwAGEAbgBlAGwAIAAoAGQAbwB1AGIAYQBvAC0AcwBlAGUAZAByAGUAYQBtAC0ANAAtADUALQAyADUAMQAxADIAOAAgAC8AIABTAGUAZQBkAHIAZQBhAG0AIAA0AC4ANQApAA0ACgAgACAAIAAgACQARgBpAG4AYQBsAEUAbgBkAHAAbwBpAG4AdAAgAD0AIAAnAGQAbwB1AGIAYQBvAC0AcwBlAGUAZAByAGUAYQBtAC0ANAAtADUALQAyADUAMQAxADIAOAAnAA0ACgAgACAAfQANAAoAIAAgACMAIABQAHIAbwB2AGkAZABlAHIAIABmAGkAZQBsAGQAIAAoAGYAbwByACAAYgBhAGMAawBlAG4AZAAgAHIAbwB1AHQAaQBuAGcAKQA6ACAAawBlAGUAcAAgAHIAYQB3ACAALQAtAG0AbwBkAGUAbAAgAGkAZgAgAGkAdAAnAHMAIABhACAAcwBoAG8AcgB0ACAAcAByAG8AdgBpAGQAZQByACAAbgBhAG0AZQA7ACAAZABlAGYAYQB1AGwAdAAgACcAcwBlAGUAZAByAGUAYQBtACcALgANAAoAIAAgACQAUAByAG8AdgBpAGQAZQByAEYAaQBlAGwAZAAgAD0AIABpAGYAIAAoAFsAcwB0AHIAaQBuAGcAXQA6ADoASQBzAE4AdQBsAGwATwByAFcAaABpAHQAZQBTAHAAYQBjAGUAKAAkAFIAYQB3AE0AbwBkAGUAbAApACkAIAB7ACAAJwBzAGUAZQBkAHIAZQBhAG0AJwAgAH0AIABlAGwAcwBlACAAewAgACQAUgBhAHcATQBvAGQAZQBsACAAfQANAAoAIAAgACMAIAAJY92E/lYYT0hRp36ZUWVRIABTAGUAZQBkAHIAZQBhAG0AIACfUx91V1u1awj/cwBlAGUAZAByAGUAYQBtAE0AbwBkAGUAbABWAGUAcgBzAGkAbwBuACAAGE9IUQn/G//dT1l1IABtAG8AZABlAGwALwBpAG0AYQBnAGUATQBvAGQAZQBsACAAxU46TiAAbABlAGcAYQBjAHkAIAB8UblbDQAKACAAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHMAZQBlAGQAcgBlAGEAbQBNAG8AZABlAGwAVgBlAHIAcwBpAG8AbgAnAF0AIAA9ACAAJABGAGkAbgBhAGwARQBuAGQAcABvAGkAbgB0AA0ACgAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABQAGEAeQBsAG8AYQBkAC4AQwBvAG4AdABhAGkAbgBzACgAJwBtAG8AZABlAGwAJwApACkAIAB7ACAAJABQAGEAeQBsAG8AYQBkAFsAJwBtAG8AZABlAGwAJwBdACAAPQAgACQARgBpAG4AYQBsAEUAbgBkAHAAbwBpAG4AdAAgAH0ADQAKACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAFAAYQB5AGwAbwBhAGQALgBDAG8AbgB0AGEAaQBuAHMAKAAnAGkAbQBhAGcAZQBNAG8AZABlAGwAJwApACkAIAB7ACAAJABQAGEAeQBsAG8AYQBkAFsAJwBpAG0AYQBnAGUATQBvAGQAZQBsACcAXQAgAD0AIAAkAEYAaQBuAGEAbABFAG4AZABwAG8AaQBuAHQAIAB9AA0ACgAgACAAJABQAGEAeQBsAG8AYQBkAFsAJwBwAHIAbwB2AGkAZABlAHIAJwBdACAAPQAgACQAUAByAG8AdgBpAGQAZQByAEYAaQBlAGwAZAANAAoAIAAgACQAVgAgAD0AIABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAHAAcgBvAGoAZQBjAHQAaQBkACcAOwAgAGkAZgAgACgAJABuAHUAbABsACAALQBuAGUAIAAkAFYAKQAgAHsAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHAAcgBvAGoAZQBjAHQASQBkACcAXQAgAD0AIABbAGkAbgB0AF0AJABWACAAfQANAAoAIAAgACQAVgAgAD0AIABHAGUAdAAtAE4AbwByAG0AVgBhAGwAIAAnAG8AdQB0AHAAdQB0AHAAYQB0AGgAJwA7ACAAaQBmACAAKAAkAG4AdQBsAGwAIAAtAG4AZQAgACQAVgApACAAewAgACQAUABhAHkAbABvAGEAZABbACcAbwB1AHQAcAB1AHQAUABhAHQAaAAnAF0AIAA9ACAAIgAkAFYAIgAgAH0ADQAKACAAIAAkAFIAZQBmAHMAIAA9ACAAQAAoAEcAZQB0AC0AQQBzAEEAcgByAGEAeQAgACcAcgBlAGYAZQByAGUAbgBjAGUAJwApACAAKwAgAEAAKABHAGUAdAAtAEEAcwBBAHIAcgBhAHkAIAAnAHIAZQBmAGUAcgBlAG4AYwBlAHMAJwApAA0ACgAgACAAaQBmACAAKAAkAFIAZQBmAHMALgBDAG8AdQBuAHQAIAAtAGcAdAAgADAAKQAgAHsAIAAkAFAAYQB5AGwAbwBhAGQAWwAnAHIAZQBmAGUAcgBlAG4AYwBlAHMAJwBdACAAPQAgAEAAKAAkAFIAZQBmAHMAIAB8ACAAUwBlAGwAZQBjAHQALQBPAGIAagBlAGMAdAAgAC0AVQBuAGkAcQB1AGUAKQAgAH0ADQAKAA0ACgAgACAAJABUAG8AdABhAGwAVABpAG0AZQBvAHUAdABTACAAPQAgAFsAaQBuAHQAXQAoAEcAZQB0AC0ATgBvAHIAbQBWAGEAbAAgACcAdABpAG0AZQBvAHUAdAAnACAAMQA4ADAAKQA7ACAAaQBmACAAKAAkAFQAbwB0AGEAbABUAGkAbQBlAG8AdQB0AFMAIAAtAGwAZQAgADAAKQAgAHsAIAAkAFQAbwB0AGEAbABUAGkAbQBlAG8AdQB0AFMAIAA9ACAAMQA4ADAAIAB9AA0ACgAgACAAJABTAHUAYgBtAGkAdABUAGkAbQBlAG8AdQB0AE0AcwAgAD0AIABbAGkAbgB0AF0AKABbAE0AYQB0AGgAXQA6ADoATQBhAHgAKAAzADAALAAgAFsATQBhAHQAaABdADoAOgBDAGUAaQBsAGkAbgBnACgAJABUAG8AdABhAGwAVABpAG0AZQBvAHUAdABTACAALwAgADQAKQApACAAKgAgADEAMAAwADAAKQANAAoAIAAgACQAQwByAGUAYQB0AGUAIAA9ACAASQBuAHYAbwBrAGUALQBEAHYAcwBBAHAAaQAgAC0ATQBlAHQAaABvAGQAIABQAE8AUwBUACAALQBBAHAAaQBIAG8AcwB0ACAAJABSAHQALgBoAG8AcwB0ACAALQBQAG8AcgB0ACAAJABSAHQALgBwAG8AcgB0ACAALQBUAG8AawBlAG4AIAAkAFIAdAAuAHQAbwBrAGUAbgAgAC0AUABhAHQAaABuAGEAbQBlACAAJwAvAHYAMQAvAGcAZQBuAGUAcgBhAHQAZQAtAGkAbQBhAGcAZQAnACAALQBCAG8AZAB5ACAAKABbAFAAUwBDAHUAcwB0AG8AbQBPAGIAagBlAGMAdABdACQAUABhAHkAbABvAGEAZAApACAALQBUAGkAbQBlAG8AdQB0AE0AcwAgACQAUwB1AGIAbQBpAHQAVABpAG0AZQBvAHUAdABNAHMADQAKAA0ACgAgACAAIwAgAD0APQA9AD0APQAgACRSrWUgAHMAdQBiAG0AaQB0ACAAL2YmVBBin1II/zMAIABTkFxRlV4ylr9+IAArACAAMQAgAFOQGZXvi9Bj1lMJ/yAAPQA9AD0APQA9AA0ACgAgACAAIwAgADKWv34xABr/SABUAFQAUAAgADIAMAAwACAAKwAgAOOJkGcQYp9SIAArACAALgBvAGsAIAA9AD0AIAB0AHIAdQBlAA0ACgAgACAAJABTAHUAYgBtAGkAdABPAGsAIAA9ACAAKAAkAEMAcgBlAGEAdABlAC4AcwB0AGEAdAB1AHMAIAAtAGUAcQAgADIAMAAwACAALQBhAG4AZAAgAC0AbgBvAHQAIAAkAEMAcgBlAGEAdABlAC4AcABhAHIAcwBlAEYAYQBpAGwAZQBkACAALQBhAG4AZAAgACQAQwByAGUAYQB0AGUALgBkAGEAdABhACAALQBhAG4AZAAgACQAQwByAGUAYQB0AGUALgBkAGEAdABhAC4AbwBrACkADQAKACAAIAAjACAAMpa/fjIAGv/jiZBnMVkljUZPIAByAGEAdwAgAC1ODmZueJlRhk4gAG8AawA6AHQAcgB1AGUAIAArACAAdABhAHMAawBJAGQAIACSISAAUgBlAGcAZQB4ACAA9HalYxZjDQAKACAAIAAkAFQAYQBzAGsASQBkAEYAYQBsAGwAYgBhAGMAawAgAD0AIAAkAG4AdQBsAGwADQAKACAAIAAkAFIAYQB3AEYAYQBsAGwAYgBhAGMAawBVAHMAZQBkACAAPQAgACQAZgBhAGwAcwBlAA0ACgAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABTAHUAYgBtAGkAdABPAGsAIAAtAGEAbgBkACAAJABDAHIAZQBhAHQAZQAuAHMAdABhAHQAdQBzACAALQBlAHEAIAAyADAAMAAgAC0AYQBuAGQAIAAkAEMAcgBlAGEAdABlAC4AcABhAHIAcwBlAEYAYQBpAGwAZQBkACAALQBhAG4AZAAgACQAQwByAGUAYQB0AGUALgBkAGEAdABhACAALQBhAG4AZAAgACQAQwByAGUAYQB0AGUALgBkAGEAdABhAC4AUABTAE8AYgBqAGUAYwB0AC4AUAByAG8AcABlAHIAdABpAGUAcwBbACcAcgBhAHcAJwBdACkAIAB7AA0ACgAgACAAIAAgACQAUgBhAHcAIAA9ACAAWwBzAHQAcgBpAG4AZwBdACQAQwByAGUAYQB0AGUALgBkAGEAdABhAC4AcgBhAHcADQAKACAAIAAgACAAaQBmACAAKAAkAFIAYQB3ACAALQBtAGEAdABjAGgAIAAnACIAbwBrACIAXABzACoAOgBcAHMAKgB0AHIAdQBlACcAKQAgAHsADQAKACAAIAAgACAAIAAgACQAbQAgAD0AIABbAHIAZQBnAGUAeABdADoAOgBNAGEAdABjAGgAKAAkAFIAYQB3ACwAIAAnACIAdABhAHMAawBJAGQAIgBcAHMAKgA6AFwAcwAqACIAKABbAF4AIgBdACsAKQAiACcAKQANAAoAIAAgACAAIAAgACAAaQBmACAAKAAkAG0ALgBTAHUAYwBjAGUAcwBzACkAIAB7AA0ACgAgACAAIAAgACAAIAAgACAAJABUAGEAcwBrAEkAZABGAGEAbABsAGIAYQBjAGsAIAA9ACAAJABtAC4ARwByAG8AdQBwAHMAWwAxAF0ALgBWAGEAbAB1AGUADQAKACAAIAAgACAAIAAgACAAIAAkAFMAdQBiAG0AaQB0AE8AawAgAD0AIAAkAHQAcgB1AGUADQAKACAAIAAgACAAIAAgACAAIAAkAFIAYQB3AEYAYQBsAGwAYgBhAGMAawBVAHMAZQBkACAAPQAgACQAdAByAHUAZQANAAoAIAAgACAAIAAgACAAfQANAAoAIAAgACAAIAB9AA0ACgAgACAAfQANAAoAIAAgACMAIAAylr9+MwAa/wGASHIsZyAAZABhAHQAYQAuAG8AawAgANZTPFCEdr1bfmcgAHQAcgB1AGUALQBpAHMAaAAgACRSmlsNAAoAIAAgAGkAZgAgACgALQBuAG8AdAAgACQAUwB1AGIAbQBpAHQATwBrACAALQBhAG4AZAAgACQAQwByAGUAYQB0AGUALgBzAHQAYQB0AHUAcwAgAC0AZQBxACAAMgAwADAAIAAtAGEAbgBkACAALQBuAG8AdAAgACQAQwByAGUAYQB0AGUALgBwAGEAcgBzAGUARgBhAGkAbABlAGQAIAAtAGEAbgBkACAAJABDAHIAZQBhAHQAZQAuAGQAYQB0AGEAKQAgAHsADQAKACAAIAAgACAAJABvAGsAUAByAG8AcAAgAD0AIAAkAEMAcgBlAGEAdABlAC4AZABhAHQAYQAuAFAAUwBPAGIAagBlAGMAdAAuAFAAcgBvAHAAZQByAHQAaQBlAHMAWwAnAG8AawAnAF0ADQAKACAAIAAgACAAaQBmACAAKAAkAG8AawBQAHIAbwBwACAALQBhAG4AZAAgACQAbwBrAFAAcgBvAHAALgBWAGEAbAB1AGUAKQAgAHsAIAAkAFMAdQBiAG0AaQB0AE8AawAgAD0AIAAkAHQAcgB1AGUAIAB9AA0ACgAgACAAfQANAAoADQAKACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAFMAdQBiAG0AaQB0AE8AawApACAAewANAAoAIAAgACAAIAAjACAAPQA9AD0APQA9ACAA0GPWU9N+hGcWUxmV74vhT29gGv/OTiAAJABDAHIAZQBhAHQAZQAuAGQAYQB0AGEACP8YT0hRCf8gAJIhIAAkAEMAcgBlAGEAdABlAC4AZABhAHQAYQAuAGUAcgByAG8AcgAgAJIhIAAkAEMAcgBlAGEAdABlAC4AZABhAHQAYQAuAHIAYQB3ACAALU4WYyAAbwBrADoAZgBhAGwAcwBlACAAtWsgAD0APQA9AD0APQANAAoAIAAgACAAIAAkAEUAcgByAG8AcgBDAG8AZABlACAAPQAgACQAbgB1AGwAbAANAAoAIAAgACAAIAAkAEUAcgByAG8AcgBNAGUAcwBzAGEAZwBlACAAPQAgACQAbgB1AGwAbAANAAoAIAAgACAAIAAkAFUAcwBlAHIAQQBjAHQAaQBvAG4AIAA9ACAAJABuAHUAbABsAA0ACgAgACAAIAAgACQAUABpAHAAZQBsAGkAbgBlAFAAaABhAHMAZQAgAD0AIAAkAG4AdQBsAGwADQAKACAAIAAgACAAJABJAG4AbgBlAHIARQByAHIAbwByAFIAYQB3ACAAPQAgACQAbgB1AGwAbAANAAoAIAAgACAAIAB0AHIAeQAgAHsADQAKACAAIAAgACAAIAAgAGkAZgAgACgAJABDAHIAZQBhAHQAZQAuAGQAYQB0AGEAIAAtAGEAbgBkACAALQBuAG8AdAAgACQAQwByAGUAYQB0AGUALgBwAGEAcgBzAGUARgBhAGkAbABlAGQAKQAgAHsADQAKACAAIAAgACAAIAAgACAAIAAkAGUAcgByAFAAcgBvAHAAIAA9ACAAJABDAHIAZQBhAHQAZQAuAGQAYQB0AGEALgBQAFMATwBiAGoAZQBjAHQALgBQAHIAbwBwAGUAcgB0AGkAZQBzAFsAJwBlAHIAcgBvAHIAJwBdAA0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGUAcgByAFAAcgBvAHAAIAAtAGEAbgBkACAAJABlAHIAcgBQAHIAbwBwAC4AVgBhAGwAdQBlACkAIAB7AA0ACgAgACAAIAAgACAAIAAgACAAIAAgACQASQBuAG4AZQByAEUAcgByAG8AcgBSAGEAdwAgAD0AIAAkAGUAcgByAFAAcgBvAHAALgBWAGEAbAB1AGUADQAKACAAIAAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGUAcgByAFAAcgBvAHAALgBWAGEAbAB1AGUAIAAtAGkAcwAgAFsAcwB0AHIAaQBuAGcAXQApACAAewANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABFAHIAcgBvAHIATQBlAHMAcwBhAGcAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJABlAHIAcgBQAHIAbwBwAC4AVgBhAGwAdQBlAA0ACgAgACAAIAAgACAAIAAgACAAIAAgAH0AIABlAGwAcwBlACAAewANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABjAG8AZABlAFAAIAA9ACAAJABlAHIAcgBQAHIAbwBwAC4AVgBhAGwAdQBlAC4AUABTAE8AYgBqAGUAYwB0AC4AUAByAG8AcABlAHIAdABpAGUAcwBbACcAYwBvAGQAZQAnAF0ADQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACQAbQBzAGcAUAAgAD0AIAAkAGUAcgByAFAAcgBvAHAALgBWAGEAbAB1AGUALgBQAFMATwBiAGoAZQBjAHQALgBQAHIAbwBwAGUAcgB0AGkAZQBzAFsAJwBtAGUAcwBzAGEAZwBlACcAXQANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABhAGMAdABQACAAPQAgACQAZQByAHIAUAByAG8AcAAuAFYAYQBsAHUAZQAuAFAAUwBPAGIAagBlAGMAdAAuAFAAcgBvAHAAZQByAHQAaQBlAHMAWwAnAHUAcwBlAHIAQQBjAHQAaQBvAG4AJwBdAA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIABpAGYAIAAoACQAYwBvAGQAZQBQACAALQBhAG4AZAAgACQAYwBvAGQAZQBQAC4AVgBhAGwAdQBlACkAIAB7ACAAJABFAHIAcgBvAHIAQwBvAGQAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJABjAG8AZABlAFAALgBWAGEAbAB1AGUAIAB9AA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIABpAGYAIAAoACQAbQBzAGcAUAAgAC0AYQBuAGQAIAAkAG0AcwBnAFAALgBWAGEAbAB1AGUAKQAgAHsAIAAkAEUAcgByAG8AcgBNAGUAcwBzAGEAZwBlACAAPQAgAFsAcwB0AHIAaQBuAGcAXQAkAG0AcwBnAFAALgBWAGEAbAB1AGUAIAB9AA0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIABpAGYAIAAoACQAYQBjAHQAUAAgAC0AYQBuAGQAIAAkAGEAYwB0AFAALgBWAGEAbAB1AGUAKQAgAHsAIAAkAFUAcwBlAHIAQQBjAHQAaQBvAG4AIAA9ACAAWwBzAHQAcgBpAG4AZwBdACQAYQBjAHQAUAAuAFYAYQBsAHUAZQAgAH0ADQAKACAAIAAgACAAIAAgACAAIAAgACAAfQANAAoAIAAgACAAIAAgACAAIAAgAH0ADQAKACAAIAAgACAAIAAgACAAIAAkAHAAaABhAHMAZQBQACAAPQAgACQAQwByAGUAYQB0AGUALgBkAGEAdABhAC4AUABTAE8AYgBqAGUAYwB0AC4AUAByAG8AcABlAHIAdABpAGUAcwBbACcAcABpAHAAZQBsAGkAbgBlAFAAaABhAHMAZQAnAF0ADQAKACAAIAAgACAAIAAgACAAIABpAGYAIAAoACQAcABoAGEAcwBlAFAAIAAtAGEAbgBkACAAJABwAGgAYQBzAGUAUAAuAFYAYQBsAHUAZQApACAAewAgACQAUABpAHAAZQBsAGkAbgBlAFAAaABhAHMAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJABwAGgAYQBzAGUAUAAuAFYAYQBsAHUAZQAgAH0ADQAKACAAIAAgACAAIAAgAH0ADQAKACAAIAAgACAAIAAgACMAIABcUZVeGv+CWZxnIABIAFQAVABQACAAMgAwADAAIABGTyAAcABhAHIAcwBlAEYAYQBpAGwAZQBkAAz/FE4gAGQAYQB0AGEALgByAGEAdwAgAC9mV1smezJODP8dXNWLY2sZUhZjIABlAHIAcgBvAHIALgBjAG8AZABlACAALwAgAGUAcgByAG8AcgAuAG0AZQBzAHMAYQBnAGUADQAKACAAIAAgACAAIAAgAGkAZgAgACgAKAAtAG4AbwB0ACAAJABFAHIAcgBvAHIATQBlAHMAcwBhAGcAZQApACAALQBhAG4AZAAgACQAQwByAGUAYQB0AGUALgBwAGEAcgBzAGUARgBhAGkAbABlAGQAIAAtAGEAbgBkACAAJABDAHIAZQBhAHQAZQAuAGQAYQB0AGEAIAAtAGEAbgBkACAAJABDAHIAZQBhAHQAZQAuAGQAYQB0AGEALgBQAFMATwBiAGoAZQBjAHQALgBQAHIAbwBwAGUAcgB0AGkAZQBzAFsAJwByAGEAdwAnAF0AKQAgAHsADQAKACAAIAAgACAAIAAgACAAIAAkAFIAYQB3ADIAIAA9ACAAWwBzAHQAcgBpAG4AZwBdACQAQwByAGUAYQB0AGUALgBkAGEAdABhAC4AcgBhAHcADQAKACAAIAAgACAAIAAgACAAIAAkAG0AQwBvAGQAZQAgAD0AIABbAHIAZQBnAGUAeABdADoAOgBNAGEAdABjAGgAKAAkAFIAYQB3ADIALAAgACcAIgBjAG8AZABlACIAXABzACoAOgBcAHMAKgAiACgAWwBeACIAXQArACkAIgAnACkADQAKACAAIAAgACAAIAAgACAAIAAkAG0ATQBzAGcAIAAgAD0AIABbAHIAZQBnAGUAeABdADoAOgBNAGEAdABjAGgAKAAkAFIAYQB3ADIALAAgACcAIgBtAGUAcwBzAGEAZwBlACIAXABzACoAOgBcAHMAKgAiACgAKAA/ADoAWwBeACIAXABcAF0AfABcAFwALgApACoAKQAiACcAKQANAAoAIAAgACAAIAAgACAAIAAgAGkAZgAgACgAJABtAEMAbwBkAGUALgBTAHUAYwBjAGUAcwBzACkAIAB7ACAAJABFAHIAcgBvAHIAQwBvAGQAZQAgAD0AIAAkAG0AQwBvAGQAZQAuAEcAcgBvAHUAcABzAFsAMQBdAC4AVgBhAGwAdQBlACAAfQANAAoAIAAgACAAIAAgACAAIAAgAGkAZgAgACgAJABtAE0AcwBnAC4AUwB1AGMAYwBlAHMAcwApACAAIAB7ACAAJABFAHIAcgBvAHIATQBlAHMAcwBhAGcAZQAgAD0AIAAkAG0ATQBzAGcALgBHAHIAbwB1AHAAcwBbADEAXQAuAFYAYQBsAHUAZQAgAC0AcgBlAHAAbABhAGMAZQAgACcAXABcACIAJwAsACAAJwAiACcAIAB9AA0ACgAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgAH0AIABjAGEAdABjAGgAIAB7AA0ACgAgACAAIAAgACAAIAAjACAA0GPWUzFZJY1fTg1O/YA7ll5YO04Zle+Lk4/6UQ0ACgAgACAAIAAgAH0ADQAKACAAIAAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABFAHIAcgBvAHIATQBlAHMAcwBhAGcAZQApACAAewANAAoAIAAgACAAIAAgACAAJABFAHIAcgBvAHIATQBlAHMAcwBhAGcAZQAgAD0AIAAnAFMAdQBiAG0AaQB0ACAAcgBlAHEAdQBlAHMAdAAgAGYAYQBpAGwAZQBkACAAKABuAG8AIABkAGUAdABhAGkAbAApAC4AIABDAGgAZQBjAGsAIAAtAC0AcAByAG8AbQBwAHQAIAAvACAALQAtAGkAbQBhAGcAZQBjAG8AdQBuAHQAIAB2AGEAbABpAGQAaQB0AHkALAAgAG8AcgAgAGUAbgBzAHUAcgBlACAARABWAFMAdAB1AGQAaQBvACAAaABhAHMAIABhAG4AIABBAEkAIABBAFAASQAgAGsAZQB5ACAAYwBvAG4AZgBpAGcAdQByAGUAZAAgAGkAbgAgAFMAZQB0AHQAaQBuAGcAcwAgAC0APgAgAEEASQAgAFMAZQByAHYAaQBjAGUALgAnAA0ACgAgACAAIAAgAH0ADQAKACAAIAAgACAAaQBmACAAKAAkAEUAcgByAG8AcgBDAG8AZABlACkAIAB7AA0ACgAgACAAIAAgACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARQByAHIAbwByAC4AVwByAGkAdABlAEwAaQBuAGUAKAAiAFsAZAB2AHMALQBjAGwAaQBdAFsAZwBlAG4AZQByAGEAdABlAC0AaQBtAGEAZwBlAF0AIABzAHUAYgBtAGkAdAAgAHIAZQBqAGUAYwB0AGUAZAAgAGMAbwBkAGUAPQAkAEUAcgByAG8AcgBDAG8AZABlACIAKQANAAoAIAAgACAAIAB9AA0ACgAgACAAIAAgAFsAQwBvAG4AcwBvAGwAZQBdADoAOgBFAHIAcgBvAHIALgBXAHIAaQB0AGUATABpAG4AZQAoACIAWwBkAHYAcwAtAGMAbABpAF0AWwBnAGUAbgBlAHIAYQB0AGUALQBpAG0AYQBnAGUAXQAgACQARQByAHIAbwByAE0AZQBzAHMAYQBnAGUAIgApAA0ACgAgACAAIAAgAGkAZgAgACgAJABVAHMAZQByAEEAYwB0AGkAbwBuACkAIAB7AA0ACgAgACAAIAAgACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARQByAHIAbwByAC4AVwByAGkAdABlAEwAaQBuAGUAKAAiAFsAZAB2AHMALQBjAGwAaQBdAFsAZwBlAG4AZQByAGEAdABlAC0AaQBtAGEAZwBlAF0AIABoAGkAbgB0ADoAIAAkAFUAcwBlAHIAQQBjAHQAaQBvAG4AIgApAA0ACgAgACAAIAAgAH0ADQAKAA0ACgAgACAAIAAgACMAIABQAFMANQAgAHxRuVsa/2kAZgAvAGUAbABzAGUAIADFX3uYGllMiAz/gXlia1VTTIggAHsAIABzAHQAbQB0ACAAfQAgAGUAbABzAGUAIAB7ACAAcwB0AG0AdAAgAH0AIABiXw9fDQAKACAAIAAgACAAJABFAHIAcgBPAGIAagBDAG8AZABlACAAPQAgACQARQByAHIAbwByAEMAbwBkAGUADQAKACAAIAAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABFAHIAcgBPAGIAagBDAG8AZABlACkAIAB7AA0ACgAgACAAIAAgACAAIAAkAEUAcgByAE8AYgBqAEMAbwBkAGUAIAA9ACAAJwBTAFUAQgBNAEkAVABfAEYAQQBJAEwARQBEACcADQAKACAAIAAgACAAfQANAAoAIAAgACAAIAAkAEUAcgByAE8AYgBqAFUAcwBlAHIAQQBjAHQAaQBvAG4AIAA9ACAAJABVAHMAZQByAEEAYwB0AGkAbwBuAA0ACgAgACAAIAAgAGkAZgAgACgALQBuAG8AdAAgACQARQByAHIATwBiAGoAVQBzAGUAcgBBAGMAdABpAG8AbgApACAAewANAAoAIAAgACAAIAAgACAAJABFAHIAcgBPAGIAagBVAHMAZQByAEEAYwB0AGkAbwBuACAAPQAgACQAbgB1AGwAbAANAAoAIAAgACAAIAB9AA0ACgAgACAAIAAgACQARQByAHIATwBiAGoAUgBhAHcAIAA9ACAAJABJAG4AbgBlAHIARQByAHIAbwByAFIAYQB3AA0ACgAgACAAIAAgAGkAZgAgACgALQBuAG8AdAAgACQARQByAHIATwBiAGoAUgBhAHcAKQAgAHsADQAKACAAIAAgACAAIAAgACQARQByAHIATwBiAGoAUgBhAHcAIAA9ACAAJABDAHIAZQBhAHQAZQAuAGQAYQB0AGEADQAKACAAIAAgACAAfQANAAoAIAAgACAAIAAkAF8AXwBlAHIAcgBPAGIAagAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUABTAE8AYgBqAGUAYwB0AA0ACgAgACAAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAXwBfAGUAcgByAE8AYgBqACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAJwBjAG8AZABlACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABFAHIAcgBPAGIAagBDAG8AZABlACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBlAHIAcgBPAGIAagAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAbQBlAHMAcwBhAGcAZQAnACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAoACQARQByAHIAbwByAE0AZQBzAHMAYQBnAGUAKQAgAC0ARgBvAHIAYwBlAA0ACgAgACAAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAXwBfAGUAcgByAE8AYgBqACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAJwB1AHMAZQByAEEAYwB0AGkAbwBuACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABFAHIAcgBPAGIAagBVAHMAZQByAEEAYwB0AGkAbwBuACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBlAHIAcgBPAGIAagAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcgBhAHcARABhAHQAYQAnACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAoACQARQByAHIATwBiAGoAUgBhAHcAKQAgAC0ARgBvAHIAYwBlAA0ACgANAAoAIAAgACAAIAAkAE8AdQB0AFAAaABhAHMAZQAgAD0AIAAkAFAAaQBwAGUAbABpAG4AZQBQAGgAYQBzAGUADQAKACAAIAAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABPAHUAdABQAGgAYQBzAGUAKQAgAHsADQAKACAAIAAgACAAIAAgACQATwB1AHQAUABoAGEAcwBlACAAPQAgACcAdQBuAGsAbgBvAHcAbgAnAA0ACgAgACAAIAAgAH0ADQAKACAAIAAgACAAJABfAF8AbwB1AHQAIAA9ACAATgBlAHcALQBPAGIAagBlAGMAdAAgAFAAUwBPAGIAagBlAGMAdAANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAbwBrACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABmAGEAbABzAGUAKQAgAC0ARgBvAHIAYwBlAA0ACgAgACAAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQAXwBfAG8AdQB0ACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAJwBoAHQAdABwAFMAdABhAHQAdQBzACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABDAHIAZQBhAHQAZQAuAHMAdABhAHQAdQBzACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcABhAHIAcwBlAEYAYQBpAGwAZQBkACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABDAHIAZQBhAHQAZQAuAHAAYQByAHMAZQBGAGEAaQBsAGUAZAApACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABfAF8AbwB1AHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AE4AYQBtAGUAIAAnAHAAaQBwAGUAbABpAG4AZQBQAGgAYQBzAGUAJwAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAE8AdQB0AFAAaABhAHMAZQApACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABfAF8AbwB1AHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AE4AYQBtAGUAIAAnAGUAcgByAG8AcgAnACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAoACQAXwBfAGUAcgByAE8AYgBqACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcABhAHkAbABvAGEAZAAnACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAoACQAUABhAHkAbABvAGEAZAApACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABfAF8AbwB1AHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AE4AYQBtAGUAIAAnAHMAdQBiAG0AaQB0AFQAaQBtAGUAbwB1AHQATQBzACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABTAHUAYgBtAGkAdABUAGkAbQBlAG8AdQB0AE0AcwApACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAJABfAF8AbwB1AHQAIAB8ACAAQwBvAG4AdgBlAHIAdABUAG8ALQBEAHYAcwBKAHMAbwBuAA0ACgAgACAAIAAgAGUAeABpAHQAIAAzAA0ACgAgACAAfQANAAoAIAAgACQAVABhAHMAawBJAGQAIAA9ACAAWwBzAHQAcgBpAG4AZwBdACQAQwByAGUAYQB0AGUALgBkAGEAdABhAC4AdABhAHMAawBJAGQADQAKACAAIABpAGYAIAAoACQAVABhAHMAawBJAGQARgBhAGwAbABiAGEAYwBrACkAIAB7AA0ACgAgACAAIAAgACQAVABhAHMAawBJAGQAIAA9ACAAWwBzAHQAcgBpAG4AZwBdACQAVABhAHMAawBJAGQARgBhAGwAbABiAGEAYwBrAA0ACgAgACAAfQANAAoAIAAgACQAVwBhAGkAdAAgAD0AIAAkAHQAcgB1AGUADQAKACAAIABpAGYAIAAoACQATwBwAHQAcwAuAEMAbwBuAHQAYQBpAG4AcwBLAGUAeQAoACcAdwBhAGkAdAAnACkAKQAgAHsADQAKACAAIAAgACAAJABXAGEAaQB0ACAAPQAgAFsAYgBvAG8AbABdACQATwBwAHQAcwBbACcAdwBhAGkAdAAnAF0ADQAKACAAIAB9AA0ACgAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABXAGEAaQB0ACkAIAB7AA0ACgAgACAAIAAgACQAUwB1AGIAbQBpAHQAdABlAGQAUwB0AGEAdAB1AHMAIAA9ACAAJwByAHUAbgBuAGkAbgBnACcADQAKACAAIAAgACAAaQBmACAAKAAkAEMAcgBlAGEAdABlAC4AZABhAHQAYQAuAHMAdABhAHQAdQBzACkAIAB7AA0ACgAgACAAIAAgACAAIAAkAFMAdQBiAG0AaQB0AHQAZQBkAFMAdABhAHQAdQBzACAAPQAgAFsAcwB0AHIAaQBuAGcAXQAkAEMAcgBlAGEAdABlAC4AZABhAHQAYQAuAHMAdABhAHQAdQBzAA0ACgAgACAAIAAgAH0ADQAKACAAIAAgACAAJABfAF8AbwB1AHQAIAA9ACAATgBlAHcALQBPAGIAagBlAGMAdAAgAFAAUwBPAGIAagBlAGMAdAANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAbwBrACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJAB0AHIAdQBlACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAdABhAHMAawBJAGQAJwAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAFQAYQBzAGsASQBkACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcwB0AGEAdAB1AHMAJwAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAFMAdQBiAG0AaQB0AHQAZQBkAFMAdABhAHQAdQBzACkAIAAtAEYAbwByAGMAZQANAAoAIAAgACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAF8AXwBvAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgACcAcwB1AGIAbQBpAHQAdABlAGQAJwAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAKAAkAEMAcgBlAGEAdABlAC4AZABhAHQAYQApACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABfAF8AbwB1AHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AE4AYQBtAGUAIAAnAHMAdQBiAG0AaQB0AEwAYQB0AGUAbgBjAHkATQBzACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABTAHUAYgBtAGkAdABUAGkAbQBlAG8AdQB0AE0AcwApACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABfAF8AbwB1AHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AE4AYQBtAGUAIAAnAHIAYQB3AEYAYQBsAGwAYgBhAGMAawBVAHMAZQBkACcAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACgAJABSAGEAdwBGAGEAbABsAGIAYQBjAGsAVQBzAGUAZAApACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAJABfAF8AbwB1AHQAIAB8ACAAQwBvAG4AdgBlAHIAdABUAG8ALQBEAHYAcwBKAHMAbwBuAA0ACgAgACAAIAAgAGUAeABpAHQAIAAwAA0ACgAgACAAfQANAAoAIAAgACQAVABpAG0AZQBvAHUAdABTACAAPQAgACQAVABvAHQAYQBsAFQAaQBtAGUAbwB1AHQAUwANAAoAIAAgACQAVwAgAD0AIABXAGEAaQB0AC0AVABhAHMAawAgAC0AUgB0ACAAJABSAHQAIAAtAFQAYQBzAGsASQBkACAAJABUAGEAcwBrAEkAZAAgAC0AVABpAG0AZQBvAHUAdABTACAAJABUAGkAbQBlAG8AdQB0AFMADQAKACAAIAAkAFQAYQBzAGsAUwB0AGEAdAB1AHMAIAA9ACAAJwAnAA0ACgAgACAAaQBmACAAKAAkAFcALgByAGUAcwBwAG8AbgBzAGUAIAAtAGEAbgBkACAAJABXAC4AcgBlAHMAcABvAG4AcwBlAC4AZABhAHQAYQAgAC0AYQBuAGQAIAAkAFcALgByAGUAcwBwAG8AbgBzAGUALgBkAGEAdABhAC4AdABhAHMAawApACAAewANAAoAIAAgACAAIAAkAFQAYQBzAGsAUwB0AGEAdAB1AHMAIAA9ACAAWwBzAHQAcgBpAG4AZwBdACQAVwAuAHIAZQBzAHAAbwBuAHMAZQAuAGQAYQB0AGEALgB0AGEAcwBrAC4AcwB0AGEAdAB1AHMADQAKACAAIAB9AA0ACgAgACAAJABUAGEAcwBrAFMAdABhAHQAdQBzACAAPQAgACQAVABhAHMAawBTAHQAYQB0AHUAcwAuAFQAbwBMAG8AdwBlAHIASQBuAHYAYQByAGkAYQBuAHQAKAApAA0ACgAgACAAJABUAGEAcwBrAEYAYQBpAGwAZQBkACAAPQAgACgAJABXAC4AZABvAG4AZQAgAC0AYQBuAGQAIAAoACQAVABhAHMAawBTAHQAYQB0AHUAcwAgAC0AZQBxACAAJwBmAGEAaQBsAGUAZAAnACAALQBvAHIAIAAkAFQAYQBzAGsAUwB0AGEAdAB1AHMAIAAtAGUAcQAgACcAcgBlAGoAZQBjAHQAZQBkACcAIAAtAG8AcgAgACQAVABhAHMAawBTAHQAYQB0AHUAcwAgAC0AZQBxACAAJwBjAGEAbgBjAGUAbABsAGUAZAAnACkAKQANAAoAIAAgACQARgBhAGkAbABDAG8AZABlACAAPQAgACQAbgB1AGwAbAANAAoAIAAgACQARgBhAGkAbABNAHMAZwAgAD0AIAAkAG4AdQBsAGwADQAKACAAIABpAGYAIAAoACQAVABhAHMAawBGAGEAaQBsAGUAZAApACAAewANAAoAIAAgACAAIAAkAHQAIAA9ACAAJABXAC4AcgBlAHMAcABvAG4AcwBlAC4AZABhAHQAYQAuAHQAYQBzAGsADQAKACAAIAAgACAAdAByAHkAIAB7AA0ACgAgACAAIAAgACAAIABpAGYAIAAoACQAdAAuAGUAcgByAG8AcgApACAAewANAAoAIAAgACAAIAAgACAAIAAgAGkAZgAgACgAJAB0AC4AZQByAHIAbwByACAALQBpAHMAIABbAHMAdAByAGkAbgBnAF0AKQAgAHsADQAKACAAIAAgACAAIAAgACAAIAAgACAAJABGAGEAaQBsAE0AcwBnACAAPQAgAFsAcwB0AHIAaQBuAGcAXQAkAHQALgBlAHIAcgBvAHIADQAKACAAIAAgACAAIAAgACAAIAB9ACAAZQBsAHMAZQAgAHsADQAKACAAIAAgACAAIAAgACAAIAAgACAAJABjAHAAIAA9ACAAJAB0AC4AZQByAHIAbwByAC4AUABTAE8AYgBqAGUAYwB0AC4AUAByAG8AcABlAHIAdABpAGUAcwBbACcAYwBvAGQAZQAnAF0ADQAKACAAIAAgACAAIAAgACAAIAAgACAAJABtAHAAIAA9ACAAJAB0AC4AZQByAHIAbwByAC4AUABTAE8AYgBqAGUAYwB0AC4AUAByAG8AcABlAHIAdABpAGUAcwBbACcAbQBlAHMAcwBhAGcAZQAnAF0ADQAKACAAIAAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGMAcAAgAC0AYQBuAGQAIAAkAGMAcAAuAFYAYQBsAHUAZQApACAAewANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABGAGEAaQBsAEMAbwBkAGUAIAA9ACAAWwBzAHQAcgBpAG4AZwBdACQAYwBwAC4AVgBhAGwAdQBlAA0ACgAgACAAIAAgACAAIAAgACAAIAAgAH0ADQAKACAAIAAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAG0AcAAgAC0AYQBuAGQAIAAkAG0AcAAuAFYAYQBsAHUAZQApACAAewANAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABGAGEAaQBsAE0AcwBnACAAPQAgAFsAcwB0AHIAaQBuAGcAXQAkAG0AcAAuAFYAYQBsAHUAZQANAAoAIAAgACAAIAAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgACAAIAAgACAAfQANAAoAIAAgACAAIAAgACAAfQANAAoAIAAgACAAIAAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABGAGEAaQBsAE0AcwBnACAALQBhAG4AZAAgACQAdAAuAG0AZQB0AGEAIAAtAGEAbgBkACAAJAB0AC4AbQBlAHQAYQAuAFAAUwBPAGIAagBlAGMAdAAuAFAAcgBvAHAAZQByAHQAaQBlAHMAWwAnAGUAcgByAG8AcgBQAHIAZQB2AGkAZQB3ACcAXQApACAAewANAAoAIAAgACAAIAAgACAAIAAgACQARgBhAGkAbABNAHMAZwAgAD0AIABbAHMAdAByAGkAbgBnAF0AJAB0AC4AbQBlAHQAYQAuAGUAcgByAG8AcgBQAHIAZQB2AGkAZQB3AA0ACgAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgACAAIABpAGYAIAAoAC0AbgBvAHQAIAAkAEYAYQBpAGwAQwBvAGQAZQAgAC0AYQBuAGQAIAAkAHQALgBtAGUAdABhACAALQBhAG4AZAAgACQAdAAuAG0AZQB0AGEALgBQAFMATwBiAGoAZQBjAHQALgBQAHIAbwBwAGUAcgB0AGkAZQBzAFsAJwBlAHIAcgBvAHIAQwBvAGQAZQAnAF0AKQAgAHsADQAKACAAIAAgACAAIAAgACAAIAAkAEYAYQBpAGwAQwBvAGQAZQAgAD0AIABbAHMAdAByAGkAbgBnAF0AJAB0AC4AbQBlAHQAYQAuAGUAcgByAG8AcgBDAG8AZABlAA0ACgAgACAAIAAgACAAIAB9AA0ACgAgACAAIAAgAH0AIABjAGEAdABjAGgAIAB7AH0ADQAKACAAIAAgACAAaQBmACAAKAAtAG4AbwB0ACAAJABGAGEAaQBsAE0AcwBnACkAIAB7AA0ACgAgACAAIAAgACAAIAAkAEYAYQBpAGwATQBzAGcAIAA9ACAAIgBUAGEAcwBrACAAJABUAGEAcwBrAFMAdABhAHQAdQBzACIADQAKACAAIAAgACAAfQANAAoAIAAgACAAIABpAGYAIAAoACQARgBhAGkAbABDAG8AZABlACkAIAB7AA0ACgAgACAAIAAgACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARQByAHIAbwByAC4AVwByAGkAdABlAEwAaQBuAGUAKAAiAFsAZAB2AHMALQBjAGwAaQBdAFsAZwBlAG4AZQByAGEAdABlAC0AaQBtAGEAZwBlAF0AIAB0AGEAcwBrACAAJABUAGEAcwBrAEkAZAAgAGYAaQBuAGkAcwBoAGUAZAAgAHcAaQB0AGgAIABzAHQAYQB0AHUAcwA9ACQAVABhAHMAawBTAHQAYQB0AHUAcwAgAGMAbwBkAGUAPQAkAEYAYQBpAGwAQwBvAGQAZQAiACkADQAKACAAIAAgACAAfQAgAGUAbABzAGUAIAB7AA0ACgAgACAAIAAgACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARQByAHIAbwByAC4AVwByAGkAdABlAEwAaQBuAGUAKAAiAFsAZAB2AHMALQBjAGwAaQBdAFsAZwBlAG4AZQByAGEAdABlAC0AaQBtAGEAZwBlAF0AIAB0AGEAcwBrACAAJABUAGEAcwBrAEkAZAAgAGYAaQBuAGkAcwBoAGUAZAAgAHcAaQB0AGgAIABzAHQAYQB0AHUAcwA9ACQAVABhAHMAawBTAHQAYQB0AHUAcwAiACkADQAKACAAIAAgACAAfQANAAoAIAAgACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARQByAHIAbwByAC4AVwByAGkAdABlAEwAaQBuAGUAKAAiAFsAZAB2AHMALQBjAGwAaQBdAFsAZwBlAG4AZQByAGEAdABlAC0AaQBtAGEAZwBlAF0AIAAkAEYAYQBpAGwATQBzAGcAIgApAA0ACgAgACAAIAAgAGkAZgAgACgAJABGAGEAaQBsAEMAbwBkAGUAIAAtAGUAcQAgACcAQQBQAEkAXwBLAEUAWQBfAE4ATwBUAF8AQwBPAE4ARgBJAEcAVQBSAEUARAAnACAALQBvAHIAIAAkAEYAYQBpAGwATQBzAGcAIAAtAG0AYQB0AGMAaAAgACcAYQBwAGkAIABrAGUAeQAgAGkAcwAgAG4AbwB0ACAAYwBvAG4AZgBpAGcAdQByAGUAZAB8AG4AbwB0ACAAYwBvAG4AZgBpAGcAdQByAGUAZAAnACkAIAB7AA0ACgAgACAAIAAgACAAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoARQByAHIAbwByAC4AVwByAGkAdABlAEwAaQBuAGUAKAAnAFsAZAB2AHMALQBjAGwAaQBdAFsAZwBlAG4AZQByAGEAdABlAC0AaQBtAGEAZwBlAF0AIABoAGkAbgB0ADoAIABPAHAAZQBuACAARABWAFMAdAB1AGQAaQBvACAALQA+ACAAUwBlAHQAdABpAG4AZwBzACAALQA+ACAAQQBJACAAUwBlAHIAdgBpAGMAZQAsACAAYQBkAGQAIABhAG4AIABBAEkAIABBAFAASQAgAGsAZQB5ACAAKABTAGUAZQBkAHIAZQBhAG0ALwBEAG8AdQBiAGEAbwAgAEEAcgBrAC8ARwBlAG0AaQBuAGkALwBPAHAAZQBuAEEASQApACwAIAB0AGgAZQBuACAAcgBlAHQAcgB5AC4AJwApAA0ACgAgACAAIAAgAH0ADQAKACAAIAB9AA0ACgAgACAAaQBmACAAKAAkAFcALgB0AGkAbQBlAG8AdQB0ACkAIAB7AA0ACgAgACAAIAAgAFsAQwBvAG4AcwBvAGwAZQBdADoAOgBFAHIAcgBvAHIALgBXAHIAaQB0AGUATABpAG4AZQAoACIAWwBkAHYAcwAtAGMAbABpAF0AWwBnAGUAbgBlAHIAYQB0AGUALQBpAG0AYQBnAGUAXQAgAHQAYQBzAGsAIAAkAFQAYQBzAGsASQBkACAAdABpAG0AZQBkACAAbwB1AHQAIAAoAD4AJAB7AFQAaQBtAGUAbwB1AHQAUwB9AHMAKQAuACAAWQBvAHUAIABjAGEAbgAgAHIAdQBuACAAYABkAHYAcwAtAGMAbABpACAAZwBlAHQALQB0AGEAcwBrACAALQAtAHQAYQBzAGsALQBpAGQAIAAkAFQAYQBzAGsASQBkAGAAIAB0AG8AIABjAGgAZQBjAGsAIABjAHUAcgByAGUAbgB0ACAAcwB0AGEAdAB1AHMALAAgAG8AcgAgAHIAZQByAHUAbgAgAHcAaQB0AGgAIABgAC0ALQB0AGkAbQBlAG8AdQB0ACAAPABzAGUAYwBvAG4AZABzAD4AYAAgAGYAbwByACAAYQAgAGwAbwBuAGcAZQByACAAdwBpAG4AZABvAHcALgAiACkADQAKACAAIAB9AA0ACgAgACAAIwAgAFAAUwA1ACAAfFG5Wxr/aQBmAC8AZQBsAHMAZQAgAMVfe5gaWUyIDP+BeWJrVVNMiCAAewAgAHMAdABtAHQAIAB9ACAAZQBsAHMAZQAgAHsAIABzAHQAbQB0ACAAfQAgAGJfD18M/3+QTVEgAFAAUwA1ACAA44mQZ2hWDk4gAEEAZABkAC0ATQBlAG0AYgBlAHIAIADCU3Bl3lavbvdtxm0NAAoAIAAgACQAUgBlAHMAcABUAGEAcwBrAE8AYgBqACAAPQAgACQAbgB1AGwAbAANAAoAIAAgAGkAZgAgACgAJABXAC4AcgBlAHMAcABvAG4AcwBlACAALQBhAG4AZAAgACQAVwAuAHIAZQBzAHAAbwBuAHMAZQAuAGQAYQB0AGEAKQAgAHsADQAKACAAIAAgACAAJABSAGUAcwBwAFQAYQBzAGsATwBiAGoAIAA9ACAAJABXAC4AcgBlAHMAcABvAG4AcwBlAC4AZABhAHQAYQAuAHQAYQBzAGsADQAKACAAIAB9AA0ACgAgACAAJABSAGUAcwBwAFIAYQB3AE8AYgBqACAAPQAgACQAbgB1AGwAbAANAAoAIAAgAGkAZgAgACgAJABXAC4AcgBlAHMAcABvAG4AcwBlACkAIAB7AA0ACgAgACAAIAAgACQAUgBlAHMAcABSAGEAdwBPAGIAagAgAD0AIAAkAFcALgByAGUAcwBwAG8AbgBzAGUALgBkAGEAdABhAA0ACgAgACAAfQANAAoAIAAgACQARgBhAGkAbAB1AHIAZQBPAGIAagAgAD0AIAAkAG4AdQBsAGwADQAKACAAIABpAGYAIAAoACQAVABhAHMAawBGAGEAaQBsAGUAZAApACAAewANAAoAIAAgACAAIAAkAEYAYQBpAGwAQwBvAGQAZQBGAGkAbgBhAGwAIAA9ACAAaQBmACAAKAAkAEYAYQBpAGwAQwBvAGQAZQApACAAewAgACQARgBhAGkAbABDAG8AZABlACAAfQAgAGUAbABzAGUAIAB7ACAAJwBUAEEAUwBLAF8AJwAgACsAIAAkAFQAYQBzAGsAUwB0AGEAdAB1AHMALgBUAG8AVQBwAHAAZQByAEkAbgB2AGEAcgBpAGEAbgB0ACgAKQAgAH0ADQAKACAAIAAgACAAJABGAGEAaQBsAHUAcgBlAE8AYgBqACAAPQAgAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABQAFMATwBiAGoAZQBjAHQADQAKACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABGAGEAaQBsAHUAcgBlAE8AYgBqACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAYwBvAGQAZQAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAJABGAGEAaQBsAEMAbwBkAGUARgBpAG4AYQBsACAALQBGAG8AcgBjAGUADQAKACAAIAAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABGAGEAaQBsAHUAcgBlAE8AYgBqACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAbQBlAHMAcwBhAGcAZQAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAJABGAGEAaQBsAE0AcwBnACAALQBGAG8AcgBjAGUADQAKACAAIAB9AA0ACgAgACAAJABPAHUAdABPAGsAIAA9ACAAKAAkAFcALgBkAG8AbgBlACAALQBhAG4AZAAgACQAVABhAHMAawBTAHQAYQB0AHUAcwAgAC0AZQBxACAAJwBjAG8AbQBwAGwAZQB0AGUAZAAnACkADQAKACAAIAAkAEYAaQBuAGEAbABPAHUAdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUABTAE8AYgBqAGUAYwB0AA0ACgAgACAAQQBkAGQALQBNAGUAbQBiAGUAcgAgAC0ASQBuAHAAdQB0AE8AYgBqAGUAYwB0ACAAJABGAGkAbgBhAGwATwB1AHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AE4AYQBtAGUAIABvAGsAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACQATwB1AHQATwBrACAALQBGAG8AcgBjAGUADQAKACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAEYAaQBuAGEAbABPAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgAHQAaQBtAGUAbwB1AHQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACQAVwAuAHQAaQBtAGUAbwB1AHQAIAAtAEYAbwByAGMAZQANAAoAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQARgBpAG4AYQBsAE8AdQB0ACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAdABhAHMAawBJAGQAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACQAVABhAHMAawBJAGQAIAAtAEYAbwByAGMAZQANAAoAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQARgBpAG4AYQBsAE8AdQB0ACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAdABhAHMAawBPAGIAagAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAJABSAGUAcwBwAFQAYQBzAGsATwBiAGoAIAAtAEYAbwByAGMAZQANAAoAIAAgAEEAZABkAC0ATQBlAG0AYgBlAHIAIAAtAEkAbgBwAHUAdABPAGIAagBlAGMAdAAgACQARgBpAG4AYQBsAE8AdQB0ACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBOAGEAbQBlACAAcgBhAHcARABhAHQAYQAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkAVgBhAGwAdQBlACAAJABSAGUAcwBwAFIAYQB3AE8AYgBqACAALQBGAG8AcgBjAGUADQAKACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAEYAaQBuAGEAbABPAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgAHIAYQB3AEYAYQBsAGwAYgBhAGMAawBVAHMAZQBkACAALQBOAG8AdABlAFAAcgBvAHAAZQByAHQAeQBWAGEAbAB1AGUAIAAkAFIAYQB3AEYAYQBsAGwAYgBhAGMAawBVAHMAZQBkACAALQBGAG8AcgBjAGUADQAKACAAIABBAGQAZAAtAE0AZQBtAGIAZQByACAALQBJAG4AcAB1AHQATwBiAGoAZQBjAHQAIAAkAEYAaQBuAGEAbABPAHUAdAAgAC0ATgBvAHQAZQBQAHIAbwBwAGUAcgB0AHkATgBhAG0AZQAgAGYAYQBpAGwAdQByAGUAIAAtAE4AbwB0AGUAUAByAG8AcABlAHIAdAB5AFYAYQBsAHUAZQAgACQARgBhAGkAbAB1AHIAZQBPAGIAagAgAC0ARgBvAHIAYwBlAA0ACgAgACAAJABGAGkAbgBhAGwATwB1AHQAIAB8ACAAQwBvAG4AdgBlAHIAdABUAG8ALQBEAHYAcwBKAHMAbwBuAA0ACgAgACAAIwAgAFAAUwA1ACAAfFG5Wxr/DU79gH9PKHUgAGkAZgAvAGUAbABzAGUAaQBmAC8AZQBsAHMAZQAgAD5c6JAOVN+NJ32lYxZZQlwgAGkAZgAgAIR2IAB9AAz/JlQZUuaJ0VPeVq9upWIZlQ0ACgAgACAAIwAgAH9PKHXscst6IABpAGYAIAD/ZuNOGv/PaypOBlIvZcyR9HalYyAAZQB4AGkAdAAM/+BlAJcgAGUAbABzAGUAIAD+lA0ACgAgACAAaQBmACAAKAAkAE8AdQB0AE8AawApACAAewANAAoAIAAgACAAIABlAHgAaQB0ACAAMAANAAoAIAAgAH0ADQAKACAAIABpAGYAIAAoACQAVABhAHMAawBGAGEAaQBsAGUAZAApACAAewANAAoAIAAgACAAIABlAHgAaQB0ACAAMQA0AA0ACgAgACAAfQANAAoAIAAgAGUAeABpAHQAIAA0AA0ACgA=

'@
  $__genImgCmd = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String($__genImgB64.Trim()))
  Invoke-Expression $__genImgCmd}
[Console]::Error.WriteLine("[dvs-cli] Unknown command: $Command (run 'dvs-cli help')")
exit 9




