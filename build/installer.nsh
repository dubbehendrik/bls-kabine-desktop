; BLS-Kabine Lehrtool: Passwortabfrage für Installation und Update.
; Hinweis: Dies ist eine Zugangshürde, keine kryptografische Sicherung –
; das Passwort ist im Installer enthalten.

!ifndef BUILD_UNINSTALLER

!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BLS_INSTALL_PASSWORD
  !define BLS_INSTALL_PASSWORD "fuelllab"
!endif

Var BlsPwDialog
Var BlsPwField
Var BlsPwTries

; Stille Installation (/S) würde die Passwortseite überspringen und ist deshalb gesperrt.
!macro customInit
  ${If} ${Silent}
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $BlsPwTries 0
!macroend

; Immer pro Benutzer installieren, ohne Auswahlseite und ohne Administratorrechte.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Wird von electron-builder an der Stelle der Seitendefinitionen eingefügt –
; dort ist die Modern-UI (MUI_HEADER_TEXT) bereits geladen.
!macro customWelcomePage
  Page custom BlsPasswordPage BlsPasswordLeave

  Function BlsPasswordPage
    !insertmacro MUI_HEADER_TEXT "Installationspasswort" "Installation und Update sind nur mit Passwort möglich."
    nsDialogs::Create 1018
    Pop $BlsPwDialog
    ${If} $BlsPwDialog == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 30u "Bitte geben Sie das Passwort ein, das Sie für das BLS-Kabine Lehrtool erhalten haben."
    Pop $0
    ${NSD_CreatePassword} 0 36u 60% 14u ""
    Pop $BlsPwField
    ${NSD_SetFocus} $BlsPwField
    nsDialogs::Show
  FunctionEnd

  Function BlsPasswordLeave
    ${NSD_GetText} $BlsPwField $0
    ${If} $0 S== "${BLS_INSTALL_PASSWORD}"
      Return
    ${EndIf}
    IntOp $BlsPwTries $BlsPwTries + 1
    ${If} $BlsPwTries >= 5
      MessageBox MB_ICONSTOP "Zu viele Fehlversuche. Die Installation wird beendet."
      Quit
    ${EndIf}
    MessageBox MB_ICONEXCLAMATION "Das Passwort ist nicht korrekt."
    ${NSD_SetText} $BlsPwField ""
    Abort
  FunctionEnd
!macroend

!endif
