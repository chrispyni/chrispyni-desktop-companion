; ChrispyNi Desktop Companion installer: default to a folder the user owns; data stays in the install folder.
!macro preInit
  SetRegView 64
  StrCpy $INSTDIR "$PROFILE\ChrispyNiDesktopCompanion"
!macroend
; Uninstall/update removes only program files and KEEPS data\, mods\, plugins\ (your saves, config, mods).
!macro customRemoveFiles
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\content"
  RMDir /r "$INSTDIR\templates"
  RMDir /r "$INSTDIR\cache"
  RMDir /r "$INSTDIR\logs"
  Delete "$INSTDIR\*.*"
!macroend
