; ============================================
; DVStudio - NSIS Custom Installer Script
; Brand: Dark theme + Emerald Green (#1f9d84)
;
; Rename checklist:
;   1. electron/config.mjs: APP_NAME default (env DWEB_APP_NAME overrides)
;   2. package.json: build.productName
;   3. package.json: build.nsis.shortcutName
;   4. BrandingText text in this file (below)
;   5. package.json: description (optional)
;   6. public/favicon.ico replacement (optional)
; ============================================

!macro customHeader
  BrandingText "DVStudio"
!macroend

!macro customInit
  FindWindow $R0 "#32770" "" $HWNDPARENT
  GetDlgItem $R1 $R0 1004
  SendMessage $R1 ${WM_USER} 9 0x00849D1F
!macroend

; Helper: invoke a PowerShell .ps1 file with a single "-Name Value" parameter.
; Quotes everything properly for paths that contain spaces (e.g. Program Files).
; Uses explicit double-quote escape ($\") inside the command string because NSIS
; does NOT treat single quotes (') as string delimiters.
!macro DvsRunPS scriptPath argName argValue
  ExecWait "$\"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe$\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $\"${scriptPath}$\" -${argName} $\"${argValue}$\"" $R8
!macroend

!macro customInstall
  ; Put "<InstallDir>\resources\bin" on the current user's PATH.
  ; The bin folder is copied there via package.json build.extraResources
  ; (from build/bin -> to: bin) so `dvs-cli ...` is globally callable.
  DetailPrint "DVStudio: adding <InstallDir>\resources\bin to user PATH..."
  !insertmacro DvsRunPS "$INSTDIR\resources\bin\install-path.ps1" "Path" "$INSTDIR\resources\bin"
!macroend

!macro customUnInstall
  DetailPrint "DVStudio: removing <InstallDir>\resources\bin from user PATH..."
  !insertmacro DvsRunPS "$INSTDIR\resources\bin\uninstall-path.ps1" "Path" "$INSTDIR\resources\bin"
  ; Preserve user data (DVSResource folder will NOT be deleted by uninstaller)
!macroend
