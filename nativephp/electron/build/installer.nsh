; LaraKube Desktop NSIS Custom Uninstallation Script
; Injected by electron-builder via directories.buildResources = 'build'

!macro customUnInstall
  ; electron-updater runs the uninstaller in silent mode (/S) on every app update.
  ; Only prompt to remove ~/.larakube and WSL during interactive uninstalls.
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "Do you also want to remove LaraKube CLI tools (~/.larakube) and the LaraKube Linux (WSL) environment from your computer?$\n$\nSelect 'No' if you want to keep using the LaraKube CLI from PowerShell or WSL." \
      IDNO skipLaraKubeClean

    DetailPrint "Terminating and unregistering LaraKube Linux WSL environment..."
    nsExec::Exec 'wsl.exe --terminate larakube-ubuntu'
    nsExec::Exec 'wsl.exe --unregister larakube-ubuntu'

    DetailPrint "Removing LaraKube CLI tools and user configuration..."
    RMDir /r "$PROFILE\.larakube"

    skipLaraKubeClean:
  ${EndIf}
!macroend
