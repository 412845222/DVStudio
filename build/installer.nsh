; ============================================
; Dweb Video Studio - NSIS Custom Installer Script
; Brand: Dark theme + Emerald Green (#1f9d84)
; ============================================

!macro customHeader
  ; Set branding text shown at the bottom of the installer
  BrandingText "Dweb Video Studio"
!macroend

!macro customInit
  ; Progress bar color customization (emerald green #1f9d84 = 0x1F9D84 in BGR is 0x849D1F)
  ; Find and colorize the progress bar
  FindWindow $R0 "#32770" "" $HWNDPARENT
  GetDlgItem $R1 $R0 1004
  SendMessage $R1 ${WM_USER} 9 0x00849D1F
!macroend

!macro customInstall
  ; No extra install actions
!macroend

!macro customUnInstall
  ; Preserve user data (DVSResource folder will NOT be deleted by uninstaller)
!macroend
