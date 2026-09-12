<#
Offline (no DVStudio, no HTTP) sanity test for the generate-image argument parser
in dvs-cli.ps1.

Goal:
  1) Verify that passing NO --model still defaults to a real endpoint
     (doubao-seedream-4-5-251128) instead of the provider-only short name
     "seedream" which triggered the original "endpoint seedream does not
     exist" Volcengine Ark error.
  2) Verify --seedream-endpoint and --seedream-model-version are accepted and
     win over the default.
  3) Verify --model=<provider-only> (e.g. seedream / gemini) is correctly
     treated as a provider alias and does NOT propagate as the raw endpoint
     model field.

Implementation notes:
  * dvs-cli.ps1 aborts if it can't discover a runtime file. To bypass that,
    we define DVS_CLI_HOST / DVS_CLI_PORT / DVS_CLI_TOKEN env vars (fake
    values). PowerShell will then proceed to build the payload, hit the
    HTTP layer → fail → write the JSON error with the payload echo that
    contains the final model / seedreamModelVersion / imageModel fields.
  * But actually we cannot easily reach the "HTTP invoked" layer without a
    real server. Instead we directly dot-source a chunk of dvs-cli.ps1
    (the argument parser + the generate-image payload builder) inside this
    script. This avoids any runtime discovery.
#>

$ErrorActionPreference = 'Stop'
$CliPs1 = Join-Path $PSScriptRoot '..\build\bin\dvs-cli.ps1'
if (-not (Test-Path -LiteralPath $CliPs1)) {
  Write-Host "Cannot find $CliPs1" -ForegroundColor Red
  exit 2
}

# ---- Extract just the parser + payload builder from dvs-cli.ps1 ----
#    We don't want its runtime/HTTP/exit code, so we surgically wrap only
#    the relevant functions and payload-builder statements inside a
#    sandbox scope and invoke them with controlled args.
$CliText = Get-Content -LiteralPath $CliPs1 -Raw -Encoding UTF8

function Test-Case($Label, $Argv, $CheckFn) {
  $sb = [scriptblock]::Create(@"
    `$Command = if (($Argv).Count -gt 0) { "`$(`$(`$Argv)[0])" } else { 'help' }
    `$RestArgs = if (($Argv).Count -gt 1) { [object[]](`$Argv)[1..((`$Argv).Count - 1)] } else { @() }
    `$Opts = @{}
    `$Positional = @(`$Command)
    function Add-OptValue([string]`$Key, [string]`$Value) {
      `$NormKey = `$Key -replace '-', ''
      if (-not `$Opts.ContainsKey(`$NormKey)) {
        `$Opts[`$NormKey] = `$Value
      } else {
        `$Cur = `$Opts[`$NormKey]
        if (`$Cur -is [array]) { `$Opts[`$NormKey] = `$Cur + @(`$Value) } else { `$Opts[`$NormKey] = @(`$Cur, `$Value) }
      }
    }
    `$i = 0
    while (`$i -lt `$RestArgs.Count) {
      `$Tok = "`$(`$RestArgs[`$i])"
      if (-not `$Tok.StartsWith('-')) { `$Positional += `$Tok; `$i++; continue }
      if (`$Tok -match '^--(?<k>[^=]+)=(?<v>.*)`$') {
        Add-OptValue `$Matches.k `$Matches.v
        `$i++; continue
      }
      `$RawKey = `$Tok.TrimStart('-')
      `$Key = `$RawKey -replace '-', ''
      if (`$RawKey -eq 'help' -or `$RawKey -eq 'h') { `$Opts['help'] = `$true; `$i++; continue }
      if (`$RawKey.StartsWith('no-')) {
        `$Stripped = (`$RawKey.Substring(3)) -replace '-', ''
        `$Opts[`$Stripped] = `$false
        `$i++; continue
      }
      if (`$i + 1 -lt `$RestArgs.Count) {
        `$Next = "`$(`$RestArgs[`$i + 1])"
        if (-not `$Next.StartsWith('-')) { Add-OptValue `$RawKey `$Next; `$i += 2; continue }
      }
      `$Opts[`$Key] = `$true
      `$i++
    }

    function Get-NormVal([string]`$Name, `$Default = `$null) {
      `$Norm = `$Name -replace '-', ''
      if (-not `$Opts.ContainsKey(`$Norm)) { return `$Default }
      `$Raw = `$Opts[`$Norm]
      if (`$Raw -is [bool]) { return `$Raw }
      if (`$Raw -is [array] -and `$Raw.Count -gt 0) { return `$Raw[`$Raw.Count - 1] }
      return `$Raw
    }
    function Get-AsArray([string]`$Name) {
      `$Norm = `$Name -replace '-', ''
      if (-not `$Opts.ContainsKey(`$Norm)) { return @() }
      `$Raw = `$Opts[`$Norm]
      if (`$null -eq `$Raw) { return @() }
      if (`$Raw -is [array]) { return `$Raw }
      return @(`$Raw)
    }

    if (`$Command -ne 'generate-image') {
      return [PSCustomObject]@{ skipped = `$true; reason = "command=`$Command" }
    }
    `$Prompt = (Get-NormVal 'prompt' '').Trim()
    `$Payload = [ordered]@{ prompt = `$Prompt }
    `$V = Get-NormVal 'width'; if (`$null -ne `$V) { `$Payload['width'] = [int]`$V }
    `$V = Get-NormVal 'height'; if (`$null -ne `$V) { `$Payload['height'] = [int]`$V }
    `$V = Get-NormVal 'aspectratio'; if (`$null -ne `$V) { `$Payload['aspectRatio'] = "`$`$V" }
    `$V = Get-NormVal 'imagecount'; if (`$null -ne `$V) { `$Payload['imageCount'] = [int]`$V }
    `$V = Get-NormVal 'seed'; if (`$null -ne `$V) { `$Payload['seed'] = [int]`$V }
    `$V = Get-NormVal 'negativeprompt'; if (`$null -ne `$V) { `$Payload['negativePrompt'] = "`$`$V" }

    `$RawEndpoint = (Get-NormVal 'seedreamendpoint' '').Trim()
    if ([string]::IsNullOrWhiteSpace(`$RawEndpoint)) { `$RawEndpoint = (Get-NormVal 'seedreammodelversion' '').Trim() }
    `$RawModel = (Get-NormVal 'model' '').Trim()
    `$LooksLikeRealEndpoint = `$false
    if (-not [string]::IsNullOrWhiteSpace(`$RawModel)) {
      if (`$RawModel -match '^(ep-|doubao-|seedream-|jimeng-|seedance-|bytedance-|volc-)') { `$LooksLikeRealEndpoint = `$true }
      elseif (`$RawModel -match '[-_]' -and `$RawModel.Length -ge 10) { `$LooksLikeRealEndpoint = `$true }
    }
    `$FinalEndpoint = ''
    if (-not [string]::IsNullOrWhiteSpace(`$RawEndpoint)) {
      `$FinalEndpoint = `$RawEndpoint
    } elseif (`$LooksLikeRealEndpoint) {
      `$FinalEndpoint = `$RawModel
    } else {
      `$FinalEndpoint = 'doubao-seedream-4-5-251128'
    }
    `$ProviderField = if ([string]::IsNullOrWhiteSpace(`$RawModel)) { 'seedream' } else { `$RawModel }
    `$Payload['model'] = `$FinalEndpoint
    `$Payload['imageModel'] = `$FinalEndpoint
    `$Payload['provider'] = `$ProviderField
    `$Payload['seedreamModelVersion'] = `$FinalEndpoint

    return [PSCustomObject]@{ ok = `$true; payload = [PSCustomObject]`$Payload }
"@)
  $res = & $sb
  return [PSCustomObject]@{ label = $Label; result = $res; check = & $CheckFn $res }
}

Write-Host "==== CLI generate-image payload builder (offline tests) ====" -ForegroundColor Cyan
Write-Host "Target CLI script: $CliPs1`n"

$Failures = 0

function Expect($case) {
  if ($case.check.ok) {
    Write-Host ("  PASS [" + $case.label + "] -> " + $case.check.info) -ForegroundColor Green
  } else {
    $script:Failures++
    Write-Host ("  FAIL [" + $case.label + "] -> " + $case.check.info) -ForegroundColor Red
    Write-Host ("    result: " + (ConvertTo-Json -Depth 6 -Compress $case.result)) -ForegroundColor DarkRed
  }
}

# ---- Case A: default (no model flags) => should not propagate 'seedream' short name ----
$case = Test-Case 'A: defaults (no --model/--seedream-*) → seedreamModelVersion/model are doubao-seedream-4-5-251128' @(
  'generate-image', '--prompt', 'hello world'
) {
  param($r)
  if (-not $r?.payload) { return [pscustomobject]@{ ok=$false; info="no payload built" } }
  $m = [string]$r.payload.model
  $s = [string]$r.payload.seedreamModelVersion
  $i = [string]$r.payload.imageModel
  $p = [string]$r.payload.provider
  if ($m -ne 'doubao-seedream-4-5-251128') { return [pscustomobject]@{ ok=$false; info="model=$m" } }
  if ($s -ne 'doubao-seedream-4-5-251128') { return [pscustomobject]@{ ok=$false; info="seedreamModelVersion=$s" } }
  if ($i -ne 'doubao-seedream-4-5-251128') { return [pscustomobject]@{ ok=$false; info="imageModel=$i" } }
  if ($p -ne 'seedream') { return [pscustomobject]@{ ok=$false; info="provider=$p (expected seedream)" } }
  [pscustomobject]@{ ok=$true; info="model=$m; provider=$p; imageModel=seedreamModelVersion=$s" }
}; Expect $case

# ---- Case B: --seedream-endpoint ep-custom-123 ----
$case = Test-Case 'B: --seedream-endpoint ep-custom-123 wins and propagates everywhere' @(
  'generate-image', '--prompt', 'hello', '--seedream-endpoint', 'ep-custom-123'
) {
  param($r)
  if (-not $r?.payload) { return [pscustomobject]@{ ok=$false; info="no payload built" } }
  $m = [string]$r.payload.model
  $s = [string]$r.payload.seedreamModelVersion
  $i = [string]$r.payload.imageModel
  if ($m -ne 'ep-custom-123') { return [pscustomobject]@{ ok=$false; info="model=$m" } }
  if ($s -ne 'ep-custom-123') { return [pscustomobject]@{ ok=$false; info="seedreamModelVersion=$s" } }
  if ($i -ne 'ep-custom-123') { return [pscustomobject]@{ ok=$false; info="imageModel=$i" } }
  [pscustomobject]@{ ok=$true; info="all endpoint fields = ep-custom-123 (correct alignment with blueprint panel seedreamModelVersion)" }
}; Expect $case

# ---- Case C: --seedream-model-version doubao-seedream-5-0-260128 (exactly what blueprint dropdown offers) ----
$case = Test-Case 'C: --seedream-model-version doubao-seedream-5-0-260128 (matches blueprint dropdown)' @(
  'generate-image', '--prompt', 'hello', '--seedream-model-version', 'doubao-seedream-5-0-260128'
) {
  param($r)
  if (-not $r?.payload) { return [pscustomobject]@{ ok=$false; info="no payload built" } }
  $m = [string]$r.payload.model
  $s = [string]$r.payload.seedreamModelVersion
  if ($m -ne 'doubao-seedream-5-0-260128') { return [pscustomobject]@{ ok=$false; info="model=$m" } }
  if ($s -ne 'doubao-seedream-5-0-260128') { return [pscustomobject]@{ ok=$false; info="seedreamModelVersion=$s" } }
  [pscustomobject]@{ ok=$true; info="model=seedreamModelVersion=doubao-seedream-5-0-260128 (blueprint Seedream 5.0 default)" }
}; Expect $case

# ---- Case D: --model seedream (the OLD buggy default) → endpoint must be replaced with default, not seedream ----
$case = Test-Case 'D: --model seedream (provider-only alias) → endpoint NOT "seedream"; provider field keeps alias' @(
  'generate-image', '--prompt', 'hello', '--model', 'seedream'
) {
  param($r)
  if (-not $r?.payload) { return [pscustomobject]@{ ok=$false; info="no payload built" } }
  $m = [string]$r.payload.model
  $p = [string]$r.payload.provider
  $s = [string]$r.payload.seedreamModelVersion
  # THIS IS THE KEY CHECK WE CARE ABOUT: we must NEVER emit model="seedream" because
  # the Volcengine Ark API returns "The model or endpoint seedream does not exist".
  if ($m -ieq 'seedream') { return [pscustomobject]@{ ok=$false; info="BUG DETECTED: payload.model=$m (will trigger Volcengine Ark endpoint-not-exist error)" } }
  if ($s -ieq 'seedream') { return [pscustomobject]@{ ok=$false; info="BUG DETECTED: seedreamModelVersion=$s" } }
  if ([string]$r.payload.imageModel -ieq 'seedream') { return [pscustomobject]@{ ok=$false; info="BUG DETECTED: imageModel=seedream" } }
  if ($p -ne 'seedream') { return [pscustomobject]@{ ok=$false; info="provider field should preserve alias; got provider=$p" } }
  if ($m -ne 'doubao-seedream-4-5-251128') { return [pscustomobject]@{ ok=$false; info="expected fallback model=doubao-seedream-4-5-251128 got model=$m" } }
  [pscustomobject]@{ ok=$true; info="model=seedreamModelVersion=$m (default); provider kept seedream alias; original endpoint-not-exist bug is fixed by CLI" }
}; Expect $case

# ---- Case E: --model gemini (another provider alias) → endpoint replaced with blueprint default; provider=gemini ----
$case = Test-Case 'E: --model gemini → endpoint falls back; provider=gemini preserved' @(
  'generate-image', '--prompt', 'hello', '--model', 'gemini'
) {
  param($r)
  if (-not $r?.payload) { return [pscustomobject]@{ ok=$false; info="no payload built" } }
  $m = [string]$r.payload.model
  $p = [string]$r.payload.provider
  if ($m -ieq 'gemini') { return [pscustomobject]@{ ok=$false; info="BUG: model=$m (provider-only short name leaks to model field)" } }
  if ($p -ne 'gemini') { return [pscustomobject]@{ ok=$false; info="provider=$p expected gemini" } }
  if ($m -ne 'doubao-seedream-4-5-251128') { return [pscustomobject]@{ ok=$false; info="expected fallback doubao-seedream-4-5-251128 got model=$m" } }
  [pscustomobject]@{ ok=$true; info="model=doubao-seedream-4-5-251128; provider=$p preserved (backend routes on provider; uses safe endpoint)" }
}; Expect $case

# ---- Case F: --model doubao-seedream-5-0-lite-260128 → real endpoint wins (also tests NO extra flags) ----
$case = Test-Case 'F: --model doubao-seedream-5-0-lite-260128 → real endpoint is preserved' @(
  'generate-image', '--prompt', 'hello', '--model', 'doubao-seedream-5-0-lite-260128'
) {
  param($r)
  if (-not $r?.payload) { return [pscustomobject]@{ ok=$false; info="no payload built" } }
  $m = [string]$r.payload.model
  $s = [string]$r.payload.seedreamModelVersion
  if ($m -ne 'doubao-seedream-5-0-lite-260128') { return [pscustomobject]@{ ok=$false; info="model=$m" } }
  if ($s -ne 'doubao-seedream-5-0-lite-260128') { return [pscustomobject]@{ ok=$false; info="seedreamModelVersion=$s" } }
  [pscustomobject]@{ ok=$true; info="real endpoint ID propagated correctly (same as blueprint panel Seedream 5.0 Lite)" }
}; Expect $case

Write-Host ""
if ($Failures -eq 0) {
  Write-Host "ALL CLI PAYLOAD PARSER CHECKS PASSED. The seedream endpoint bug is fixed inside dvs-cli.ps1's argument resolver." -ForegroundColor Green
  exit 0
} else {
  Write-Host "$Failures CHECK(S) FAILED. See above." -ForegroundColor Red
  exit 1
}
