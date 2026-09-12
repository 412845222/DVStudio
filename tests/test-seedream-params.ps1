<#
  Offline test: verify Seedream parameter normalization logic in dvs-cli.ps1
  (width/height -> size(1K/2K/3K/4K) + aspect_ratio(1:1/16:9/...) reverse mapping)
#>

$ErrorActionPreference = 'Stop'

$VALID_SIZES = New-Object System.Collections.Generic.HashSet[string] (, [string[]]@('1K','2K','3K','4K'))
$VALID_RATIOS = New-Object System.Collections.Generic.HashSet[string] (, [string[]]@('1:1','16:9','9:16','4:3','3:4','21:9','3:2','2:3'))
$SIZE_MAP = [ordered]@{
  '1K' = [ordered]@{ '1:1'='1024x1024'; '4:3'='1152x864'; '3:4'='864x1152'; '16:9'='1280x720'; '9:16'='720x1280'; '3:2'='1248x832'; '2:3'='832x1248'; '21:9'='1512x648' }
  '2K' = [ordered]@{ '1:1'='2048x2048'; '4:3'='2304x1728'; '3:4'='1728x2304'; '16:9'='2848x1600'; '9:16'='1600x2848'; '3:2'='2496x1664'; '2:3'='1664x2496'; '21:9'='3136x1344' }
  '3K' = [ordered]@{ '1:1'='3072x3072'; '4:3'='3456x2592'; '3:4'='2592x3456'; '16:9'='4096x2304'; '9:16'='2304x4096'; '3:2'='3744x2496'; '2:3'='2496x3744'; '21:9'='4704x2016' }
  '4K' = [ordered]@{ '1:1'='4096x4096'; '4:3'='4704x3520'; '3:4'='3520x4704'; '16:9'='5504x3040'; '9:16'='3040x5504'; '3:2'='4992x3328'; '2:3'='3328x4992'; '21:9'='6240x2656' }
}
$WXH_INDEX = @{}
foreach ($preset in $SIZE_MAP.Keys) {
  foreach ($ratio in $SIZE_MAP[$preset].Keys) {
    $wxh = $SIZE_MAP[$preset][$ratio]
    if (-not $WXH_INDEX.ContainsKey($wxh)) { $WXH_INDEX[$wxh] = [pscustomobject]@{ preset = $preset; ratio = $ratio } }
  }
}
function _GCD($a, $b) { if ($b -eq 0) { return $a } return _GCD $b ($a % $b) }

function Resolve-SeedreamParams {
  param(
    [int]$RawWidth, [int]$RawHeight,
    [string]$SizeFromUser, [string]$RatioFromUser
  )
  $MatchedPreset = ''; $MatchedRatio = ''
  if ($SizeFromUser -and $RatioFromUser) {
    $MatchedPreset = $SizeFromUser; $MatchedRatio = $RatioFromUser
  } else {
    $HasW = ($RawWidth -gt 0); $HasH = ($RawHeight -gt 0)
    if ($HasW -or $HasH) {
      $GuessW = if ($HasW) { $RawWidth } else { 0 }
      $GuessH = if ($HasH) { $RawHeight } else { 0 }
      # When only one side is provided, treat missing side EQUAL to the known side (1:1 approximation).
      # This makes e.g. width=2000 treat as 2000x2000 -> hit 2K instead of falsely hitting 1K.
      if (($GuessW -gt 0) -xor ($GuessH -gt 0)) {
        $knownSide = [Math]::Max($GuessW, $GuessH)
        $GuessW = $knownSide; $GuessH = $knownSide
      }
      $ExactKey = "${GuessW}x${GuessH}"
      if ($WXH_INDEX.ContainsKey($ExactKey)) {
        $MatchedPreset = $WXH_INDEX[$ExactKey].preset
        $MatchedRatio = $WXH_INDEX[$ExactKey].ratio
      } else {
        $G = _Gcd $GuessW $GuessH
        $SimpleRatio = if ($G -gt 0) { "{0}:{1}" -f [Math]::Floor($GuessW / $G), [Math]::Floor($GuessH / $G) } else { '' }
        $Best = $null
        # Strategy A: only compare OFFICIAL enum ratios matching the simplified ratio
        foreach ($PresetKey in $SIZE_MAP.Keys) {
          foreach ($RatioKey in $SIZE_MAP[$PresetKey].Keys) {
            if ($SimpleRatio -and $RatioKey -ne $SimpleRatio) { continue }
            $Standard = $SIZE_MAP[$PresetKey][$RatioKey]
            $Parts = $Standard -split 'x'
            $Sw = [int]$Parts[0]; $Sh = [int]$Parts[1]
            $Diff = [Math]::Abs(($GuessW * $GuessH) - ($Sw * $Sh))
            $Cur = [pscustomobject]@{ preset = $PresetKey; ratio = $RatioKey; diff = $Diff }
            if (($null -eq $Best) -or ($Cur.diff -lt $Best.diff)) { $Best = $Cur }
          }
        }
        # Strategy B: if SimpleRatio not in official enum (candidates empty), global scan ALL 32 presets WITHOUT ratio filter
        if ($null -eq $Best) {
          foreach ($PresetKey in $SIZE_MAP.Keys) {
            foreach ($RatioKey in $SIZE_MAP[$PresetKey].Keys) {
              $Standard = $SIZE_MAP[$PresetKey][$RatioKey]
              $Parts = $Standard -split 'x'
              $Sw = [int]$Parts[0]; $Sh = [int]$Parts[1]
              $Diff = [Math]::Abs(($GuessW * $GuessH) - ($Sw * $Sh))
              $Cur = [pscustomobject]@{ preset = $PresetKey; ratio = $RatioKey; diff = $Diff }
              if (($null -eq $Best) -or ($Cur.diff -lt $Best.diff)) { $Best = $Cur }
            }
          }
        }
        if ($null -ne $Best) {
          $MatchedPreset = $Best.preset
          $MatchedRatio = $Best.ratio
        }
      }
    } elseif ($RatioFromUser) {
      $MatchedPreset = '2K'; $MatchedRatio = $RatioFromUser
    } elseif ($SizeFromUser) {
      $MatchedPreset = $SizeFromUser; $MatchedRatio = '1:1'
    } else {
      $MatchedPreset = '2K'; $MatchedRatio = '1:1'
    }
  }
  if (-not $VALID_SIZES.Contains($MatchedPreset)) { $MatchedPreset = '2K' }
  if (-not $VALID_RATIOS.Contains($MatchedRatio)) { $MatchedRatio = '1:1' }
  $Wxh = $SIZE_MAP[$MatchedPreset][$MatchedRatio]
  $Parts = $Wxh -split 'x'
  return [pscustomobject]@{
    size = $MatchedPreset
    aspectRatio = $MatchedRatio
    width = [int]$Parts[0]
    height = [int]$Parts[1]
    wxh = $Wxh
  }
}

$TestCases = @(
  @{ w = 1024; h = 1024; expectSize = '1K'; expectRatio = '1:1'; label = '1K 1:1 exact' },
  @{ w = 2048; h = 2048; expectSize = '2K'; expectRatio = '1:1'; label = '2K 1:1 exact' },
  @{ w = 2848; h = 1600; expectSize = '2K'; expectRatio = '16:9'; label = '2K 16:9 exact' },
  @{ w = 1600; h = 2848; expectSize = '2K'; expectRatio = '9:16'; label = '2K 9:16 exact' },
  @{ w = 4096; h = 2304; expectSize = '3K'; expectRatio = '16:9'; label = '3K 16:9 exact' },
  @{ w = 5504; h = 3040; expectSize = '4K'; expectRatio = '16:9'; label = '4K 16:9 exact' },
  @{ w = 1000; h = 1000; expectSize = '1K'; expectRatio = '1:1'; label = '~1:1 area near 1K' },
  @{ w = 1900; h = 1900; expectSize = '2K'; expectRatio = '1:1'; label = '~1:1 area near 2K' },
  @{ w = 1200; h = 700; expectSize = '1K'; expectRatio = '16:9'; label = '~16:9 area near 1K 16:9' },
  @{ w = 2000; h = 0; expectSize = '2K'; expectRatio = '1:1'; label = 'only width=2000' },
  @{ w = 0; h = 0; ratio = '3:4'; expectSize = '2K'; expectRatio = '3:4'; label = 'only ratio=3:4' },
  @{ w = 0; h = 0; size = '3K'; expectSize = '3K'; expectRatio = '1:1'; label = 'only size=3K' },
  @{ w = 0; h = 0; expectSize = '2K'; expectRatio = '1:1'; label = 'empty fallback' },
  @{ w = 800; h = 600; expectSize = '1K'; expectRatio = '4:3'; label = '4:3 simplified ratio hit' }
)

$Passed = 0; $Failed = 0
Write-Host "=== Seedream Parameter Normalization Test (PS1) ===" -ForegroundColor Cyan
foreach ($tc in $TestCases) {
  $sz = if ($tc.ContainsKey('size')) { $tc.size } else { '' }
  $ra = if ($tc.ContainsKey('ratio')) { $tc.ratio } else { '' }
  $result = Resolve-SeedreamParams -RawWidth $tc.w -RawHeight $tc.h -SizeFromUser $sz -RatioFromUser $ra
  $ok = ($result.size -eq $tc.expectSize) -and ($result.aspectRatio -eq $tc.expectRatio)
  if ($ok) {
    $Passed++
    Write-Host ("[PASS] " + $tc.label.PadRight(32) + " -> size=$($result.size) ratio=$($result.aspectRatio) (W$($result.width)xH$($result.height))") -ForegroundColor Green
  } else {
    $Failed++
    Write-Host ("[FAIL] " + $tc.label) -ForegroundColor Red
    Write-Host ("  expect: size=$($tc.expectSize) ratio=$($tc.expectRatio)") -ForegroundColor Red
    Write-Host ("  actual: size=$($result.size) ratio=$($result.aspectRatio) wxh=$($result.wxh)") -ForegroundColor Red
  }
}
Write-Host ""
$ResultColor = if ($Failed -eq 0) { 'Green' } else { 'Red' }
Write-Host "Results: PASS=$Passed FAIL=$Failed TOTAL=$($TestCases.Count)" -ForegroundColor $ResultColor
exit $Failed
