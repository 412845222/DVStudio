# DVSTUDIO MOCK CONTROL SERVER — for offline validation of dvs-cli.ps1
# Starts a tiny HTTP listener on 127.0.0.1:PORT that returns exactly the same
# payloads as the real CLI control server (health, submit, get-task).
# Writes a temporary cli-control-server.json into a temp runtime dir so that
# dvs-cli.ps1 discovery picks it up.  Then runs several dvs-cli invocations
# via DVS_CLI_HOST / DVS_CLI_PORT / DVS_CLI_TOKEN override to cover all
# branches.  This validates robustness WITHOUT running the full electron app.
param(
  [string]$CliPs1 = (Join-Path (Split-Path -Parent $PSScriptRoot) 'build\bin\dvs-cli.ps1'),
  [int]$Port = 51999,
  [string]$Token = 'dvs_cli_mock_token_for_test'
)
$ErrorActionPreference = 'Stop'

# ---------- 1. Start mock HTTP listener ----------
$Prefix = "http://127.0.0.1:$Port/"
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Prefix)
$Listener.Start()
Write-Host "Mock server listening on $Prefix"

$MockTaskId = 'task_mock_local_verify'
$MockPrompt = 'cyberpunk neon tokyo street at night with rain reflections'
$MockResponse = [ordered]@{
  ok = $true
  taskId = $MockTaskId
  status = 'running'
  pipelinePhase = 'p3-direct-pending'
  submittedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  note = 'Task queued for direct execution (seedream priority). Poll get-task or use wait-task for progress.'
}

# Mock precheck-failure bodies
$MockPrecheckNoKeyBody = [ordered]@{
  ok = $false
  taskId = $null
  status = 'rejected'
  pipelinePhase = 'precheck-failed'
  submittedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  error = [ordered]@{
    code = 'API_KEY_NOT_CONFIGURED'
    message = 'AI API key (Seedream / Doubao Ark / Gemini / OpenAI) is not configured. Please open DVStudio → Settings → AI Service and add your API key, then retry this command.'
    userAction = 'settings:ai-service:add-api-key'
  }
  note = 'Precheck rejected: API_KEY_NOT_CONFIGURED. See error.message for instructions.'
}
$MockPrecheckBadImageCountBody = [ordered]@{
  ok = $false
  taskId = $null
  status = 'rejected'
  pipelinePhase = 'precheck-failed'
  submittedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  error = [ordered]@{
    code = 'INVALID_IMAGE_COUNT'
    message = 'imageCount must be a number between 1 and 16 (got -5).'
  }
  note = 'Precheck rejected: INVALID_IMAGE_COUNT.'
}
# Mock task failure body (wait-task poll returns failed status with structured error)
$MockTaskFailedBody = [ordered]@{
  ok = $true
  task = [ordered]@{
    taskId = $MockTaskId
    command = 'generate-image'
    status = 'failed'
    payload = [ordered]@{ prompt = $MockPrompt }
    error = [ordered]@{
      code = 'SEEDREAM_API_ERROR'
      message = 'seedream stream error: seedream api key (ark api key) is not configured'
    }
    meta = [ordered]@{
      errorPreview = 'seedream api key (ark api key) is not configured'
      errorCode = 'API_KEY_NOT_CONFIGURED'
      pipelinePhase = 'p3-direct-failed-fallback-to-p2'
    }
  }
}

# Two variants to exercise both parse-success AND parse-fail fallback:
$BodyVariant1 = [System.Text.Encoding]::UTF8.GetBytes(($MockResponse | ConvertTo-Json -Compress))
# Variant 2: inject a BOM + random whitespace at start.
$BodyVariant2 = [byte[]]([byte]0xEF,[byte]0xBB,[byte]0xBF) + [System.Text.Encoding]::UTF8.GetBytes("  `r`n" + ($MockResponse | ConvertTo-Json -Compress) + "  ")
$HealthBody = [System.Text.Encoding]::UTF8.GetBytes((
  [ordered]@{ ok = $true; running = $true; server = [ordered]@{ host = '127.0.0.1'; port = $Port; url = "http://127.0.0.1:$Port" }
  } | ConvertTo-Json -Compress
))
$GetTaskBody = [System.Text.Encoding]::UTF8.GetBytes((
  [ordered]@{
    ok = $true
    task = [ordered]@{
      taskId = $MockTaskId; kind = 'generate-image'; status = 'completed';
      payload = [ordered]@{ prompt = $MockPrompt }; outputFiles = @('C:\mock\out.png'); exportedFiles = @('C:\mock\export.png')
    }
  } | ConvertTo-Json -Compress -Depth 10
))
$GetTaskFailedBytes = [System.Text.Encoding]::UTF8.GetBytes(($MockTaskFailedBody | ConvertTo-Json -Compress -Depth 10))
$NoKeyBytes     = [System.Text.Encoding]::UTF8.GetBytes(($MockPrecheckNoKeyBody | ConvertTo-Json -Compress -Depth 10))
$BadCountBytes  = [System.Text.Encoding]::UTF8.GetBytes(($MockPrecheckBadImageCountBody | ConvertTo-Json -Compress -Depth 10))
$StopServer = $false
# Start the listener loop on a dedicated background runspace (no ThreadJob needed).
$Runspace = [runspacefactory]::CreateRunspace()
$Runspace.Open()
$PS = [powershell]::Create()
$PS.Runspace = $Runspace
$null = $PS.AddScript({
  param($L, $HB, $B1, $B2, $GTB, $GTFailedB, $NoKeyB, $BadCountB, $Tk, $Pt)
  $UseVariant = 1
  $SubmitCounter = 0
  $GetTaskCounter = 0
  while ($L.IsListening) {
    $Ctx = $null
    try { $Ctx = $L.GetContext() } catch { break }
    if (-not $Ctx) { break }
    $Req = $Ctx.Request; $Res = $Ctx.Response
    try {
      $Path = $Req.Url.AbsolutePath
      if ($Path -eq '/health' -and $Req.HttpMethod -eq 'GET') {
        $Res.StatusCode = 200
        $Res.ContentType = 'application/json; charset=utf-8'
        $Res.ContentLength64 = $HB.Length
        $Res.OutputStream.Write($HB, 0, $HB.Length)
      } elseif ($Path -eq '/tools') {
        $Res.StatusCode = 200; $Res.ContentType = 'application/json; charset=utf-8'
        $b = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"tools":[{"name":"generate_image"}]}')
        $Res.ContentLength64 = $b.Length; $Res.OutputStream.Write($b,0,$b.Length)
      } elseif ($Path -eq '/v1/generate-image' -and $Req.HttpMethod -eq 'POST') {
        $hdr = $Req.Headers['x-dvs-cli-token']
        if ($hdr -ne $Tk) {
          $Res.StatusCode = 401
          $msg = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"AUTH_FAILED"}')
          $Res.ContentLength64=$msg.Length
          $Res.OutputStream.Write($msg,0,$msg.Length)
          $Res.OutputStream.Flush(); $Ctx.Response.Close(); continue
        }
        # Read request body to decide which precheck-failure mock to return based on query/magic values
        $Reader = New-Object System.IO.StreamReader($Req.InputStream, [System.Text.Encoding]::UTF8)
        $ReqBodyStr = $Reader.ReadToEnd()
        $ReqBody = $null
        try { $ReqBody = $ReqBodyStr | ConvertFrom-Json } catch {}
        $SubmitCounter++

        $RespBytes = $null
        $PromptStr = if ($ReqBody -and $ReqBody.PSObject.Properties['prompt']) { [string]$ReqBody.prompt } else { '' }
        $HasBadCountMarker = $false
        # Try all the ways a negative imageCount can arrive (PowerShell arg parsing splits --image-count -5)
        if ($ReqBody) {
          if ($ReqBody.PSObject.Properties['imageCount']) {
            try { if ([double]$ReqBody.imageCount -lt 0) { $HasBadCountMarker = $true } } catch {}
          }
          # Fallback marker: prompt explicitly requests INVALID_IMAGE_COUNT scenario
          if ($PromptStr -match '\[MOCK:INVALID_IMAGE_COUNT\]') { $HasBadCountMarker = $true }
        }
        # Route to mock precheck-failure cases based on EXPLICIT markers in prompt (deterministic, no counter dependency)
        if ($HasBadCountMarker) {
          $RespBytes = $BadCountB
        } elseif ($PromptStr -match '\[MOCK:API_KEY_NOT_CONFIGURED\]') {
          # Caller explicitly asks for the API_KEY_NOT_CONFIGURED precheck failure
          $RespBytes = $NoKeyB
        } else {
          $RespBytes = if ($UseVariant -eq 1) { $UseVariant = 2; $B1 } else { $UseVariant = 1; $B2 }
        }
        $Res.StatusCode = 200
        $Res.ContentType = 'application/json; charset=utf-8'
        $Res.ContentLength64 = $RespBytes.Length
        $Res.OutputStream.Write($RespBytes, 0, $RespBytes.Length)
      } elseif ($Path -match "/v1/tasks/([^/]+)(.*)$") {
        $taskIdPart = $Matches[1]
        $GetTaskCounter++
        $body = $GTB
        # Special task ID that always returns failed status → exercises wait-task failure extraction branch
        if ($taskIdPart -eq 'task_fail_precheck_api_key' -or ($taskIdPart -eq $MockTaskId -and $GetTaskCounter % 3 -eq 0)) {
          $body = $GTFailedB
        }
        $Res.StatusCode = 200
        $Res.ContentType = 'application/json; charset=utf-8'
        $Res.ContentLength64 = $body.Length
        $Res.OutputStream.Write($body,0,$body.Length)
      } else {
        $Res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"NOT_FOUND"}')
        $Res.ContentLength64 = $msg.Length
        $Res.OutputStream.Write($msg,0,$msg.Length)
      }
      $Res.OutputStream.Flush()
      $Ctx.Response.Close()
    } catch {
      try { $Ctx.Response.Abort() } catch {}
    }
  }
}).AddArgument($Listener).AddArgument($HealthBody).AddArgument($BodyVariant1).AddArgument($BodyVariant2).AddArgument($GetTaskBody).AddArgument($GetTaskFailedBytes).AddArgument($NoKeyBytes).AddArgument($BadCountBytes).AddArgument($Token).AddArgument($Port)
$Async = $PS.BeginInvoke()

# ---------- 2. Run dvs-cli commands with env override pointing at mock server ----------
Write-Host "Using CLI script: $CliPs1"

function Run-Cli($Label, [string[]]$CliArgs) {
  Write-Host "`n==== TEST CASE: $Label ====" -ForegroundColor Cyan
  $CliFull = (Resolve-Path -LiteralPath $CliPs1 -ErrorAction Stop).Path
  Write-Host "> powershell -NoProfile -ExecutionPolicy Bypass -File `"$CliFull`" $($CliArgs -join ' ')" -ForegroundColor DarkGray
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'powershell.exe'
  # PS5 StartInfo.ArgumentList isn't always available; fall back to .Arguments with manual quoting
  $EscArgs = @($CliFull) + @($CliArgs | ForEach-Object {
    $s = "$_"
    if ($s -match '[ \t"]') {
      # Escape embedded quotes by doubling them and wrap
      '"' + ($s -replace '"', '""') + '"'
    } else { $s }
  })
  $psi.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File ' + ($EscArgs -join ' '))
  $psi.EnvironmentVariables['DVS_CLI_HOST']  = '127.0.0.1'
  $psi.EnvironmentVariables['DVS_CLI_PORT']  = "$Port"
  $psi.EnvironmentVariables['DVS_CLI_TOKEN'] = "$Token"
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute = $false
  $P = [System.Diagnostics.Process]::Start($psi)
  $StdOut = $P.StandardOutput.ReadToEnd()
  $StdErr = $P.StandardError.ReadToEnd()
  $P.WaitForExit()
  $Exit = $P.ExitCode
  $Combined = (@($StdOut, $StdErr) | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") }) -join "`n"
  Write-Host (($Combined -split "`n") | ForEach-Object { "  $_" } | Out-String)
  Write-Host "  EXIT=$Exit" -ForegroundColor DarkYellow
  return [PSCustomObject]@{ label = $Label; exit = $Exit; output = $Combined }
}

Write-Host "`n"
$T1 = Run-Cli 'status' @('status')
Start-Sleep -Milliseconds 150
$T2 = Run-Cli 'tools'  @('tools')
Start-Sleep -Milliseconds 150
$T3 = Run-Cli 'submit-no-wait (variant1 BOM-less body)' @(
  'generate-image',
  '--prompt', $MockPrompt,
  '--width', '1280', '--height', '720',
  '--image-count', '1',
  '--no-wait'
)
Start-Sleep -Milliseconds 150
$T4 = Run-Cli 'submit-no-wait (variant2 BOM-padded body, exercises fallback)' @(
  'generate-image',
  '--prompt', $MockPrompt,
  '--width', '1024', '--height', '1024',
  '--image-count', '1',
  '--no-wait'
)
Start-Sleep -Milliseconds 150
$T5 = Run-Cli 'get-task returns completed' @(
  'get-task', '--task-id', $MockTaskId
)
Start-Sleep -Milliseconds 150
$T6 = Run-Cli 'generate-image + wait-task (poll endpoint returns completed immediately → ok:true)' @(
  'generate-image',
  '--prompt', $MockPrompt,
  '--width', '1024', '--height', '1024',
  '--image-count', '1',
  '--timeout', '30'
)
Start-Sleep -Milliseconds 150
# T7: submit with prompt containing [MOCK:API_KEY_NOT_CONFIGURED] → server returns precheck-failed API_KEY_NOT_CONFIGURED
$T7 = Run-Cli 'submit precheck-failure API_KEY_NOT_CONFIGURED → exit=3, structured error printed + exit 3' @(
  'generate-image',
  '--prompt', '[MOCK:API_KEY_NOT_CONFIGURED] a beautiful mountain landscape',
  '--no-wait'
)
Start-Sleep -Milliseconds 150
# T8: submit with prompt marker [MOCK:INVALID_IMAGE_COUNT] → server returns precheck INVALID_IMAGE_COUNT → exit=3, code present
$T8 = Run-Cli 'submit precheck-failure INVALID_IMAGE_COUNT → exit=3, code/message extracted' @(
  'generate-image',
  '--prompt', '[MOCK:INVALID_IMAGE_COUNT] prompt with negative image count intent',
  '--image-count=-5',
  '--no-wait'
)
Start-Sleep -Milliseconds 150
# T9: wait-task for task id that poll returns FAILED with structured error → exit non-zero, error extracted
$T9 = Run-Cli 'wait-task for pre-failed task id → exit non-zero, error.code/message + ok:false extracted' @(
  'wait-task',
  '--task-id', 'task_fail_precheck_api_key',
  '--timeout', '5'
)
Start-Sleep -Milliseconds 150
# T10: generate-image with EMPTY prompt → CLI-level precheck (before HTTP) exits with 400 MISSING_PROMPT
$T10 = Run-Cli 'CLI client-side precheck missing prompt → exit=400, no HTTP request' @(
  'generate-image',
  '--prompt', ''
)

# ---------- 3. Shutdown mock server ----------
try { $Listener.Stop() } catch {}
try { $Listener.Close() } catch {}
try { $PS.EndInvoke($Async) | Out-Null } catch {}
try { $PS.Dispose() } catch {}
try { $Runspace.Close() } catch {}
try { $Runspace.Dispose() } catch {}

# ---------- 4. Summary + verdict ----------
function Expect($Test, [bool]$Cond) {
  if ($Cond) { Write-Host "  PASS [$($Test.label)] exit=$($Test.exit)" -ForegroundColor Green; return $true }
  Write-Host "  FAIL [$($Test.label)] expected cond false; exit=$($Test.exit); output=`n$($Test.output)" -ForegroundColor Red
  return $false
}
Write-Host "`n==== VERDICT ====" -ForegroundColor Cyan
$AllOk = $true
$AllOk = (Expect $T1 ($T1.exit -eq 0)) -and $AllOk
$AllOk = (Expect $T2 ($T2.exit -eq 0)) -and $AllOk
$AllOk = (Expect $T3 ($T3.exit -eq 0 -and ($T3.output -match '"ok"\s*:\s*true'))) -and $AllOk
$AllOk = (Expect $T4 ($T4.exit -eq 0 -and ($T4.output -match '"ok"\s*:\s*true'))) -and $AllOk
$AllOk = (Expect $T5 ($T5.exit -eq 0 -and ($T5.output -match '"ok"\s*:\s*true'))) -and $AllOk
$AllOk = (Expect $T6 ($T6.exit -eq 0 -and ($T6.output -match '"ok"\s*:\s*true'))) -and $AllOk
$AllOk = (Expect $T7 (
  $T7.exit -eq 3 -and
  ($T7.output -match 'API_KEY_NOT_CONFIGURED') -and
  ($T7.output -match '"ok"\s*:\s*false') -and
  ($T7.output -match 'userAction')
)) -and $AllOk
$AllOk = (Expect $T8 (
  $T8.exit -eq 3 -and
  ($T8.output -match 'INVALID_IMAGE_COUNT') -and
  ($T8.output -match '"ok"\s*:\s*false') -and
  ($T8.output -match 'pipelinePhase.*precheck-failed')
)) -and $AllOk
$AllOk = (Expect $T9 (
  $T9.exit -ne 0 -and
  (
    ($T9.output -match 'API_KEY_NOT_CONFIGURED') -or
    ($T9.output -match 'seedream api key') -or
    ($T9.output -match '"ok"\s*:\s*false')
  )
)) -and $AllOk
$AllOk = (Expect $T10 (
  $T10.exit -eq 400 -and
  ($T10.output -match 'MISSING_PROMPT|requires --prompt')
)) -and $AllOk

if ($AllOk) {
  Write-Host "`nALL TESTS PASSED. dvs-cli.ps1 works for success paths, BOM-padded payloads, client+server precheck failures, and wait-task failure extraction.`n" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`nSOME TESTS FAILED. See above.`n" -ForegroundColor Red
  exit 1
}
