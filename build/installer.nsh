; ============================================
; DVStudio - NSIS Custom Installer Script
; Brand: Dark theme + Emerald Green (#1f9d84)
;
; 更名指南：修改产品名称时需同步修改以下位置：
;   1. electron/config.mjs 中 APP_NAME 默认值（支持 DWEB_APP_NAME 环境变量覆盖）
;   2. package.json 中 build.productName 字段
;   3. package.json 中 build.nsis.shortcutName 字段
;   4. 本文件 BrandingText 文本（见下方）
;   5. package.json 中 description 字段（可选，产品描述）
;   6. public/favicon.ico 替换为产品图标（可选）
; ============================================

!macro customHeader
  ; Set branding text shown at the bottom of the installer
  BrandingText "DVStudio"
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
