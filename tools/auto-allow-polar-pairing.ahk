; ============================================================================
; Auto-allow Polar pairing popups
; ----------------------------------------------------------------------------
; Watches for the Windows pairing notification and presses "Allow", but only
; when the notification mentions "Polar", so no other device can pair this way.
;
; Requires:
;   - AutoHotkey v2 (https://www.autohotkey.com)
;   - UIA.ahk from the UIA-v2 library (https://github.com/Descolada/UIA-v2),
;     saved in the same folder as this script (it's in the Lib folder there).
;
; Controls:
;   Ctrl + Alt + Shift + P   pause or resume watching
;   Ctrl + Alt + Shift + D   show what the script can see (for troubleshooting)
; ============================================================================
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include UIA.ahk

; Words to look for. If your Windows isn't in English, change these to match
; the popup's own wording.
DEVICE_WORD := "Polar"
ALLOW_LABEL := "Allow"

; Where Windows shows notifications. If the script never reacts, open
; Window Spy (right-click the AutoHotkey tray icon) while the popup is visible
; and compare its title and program with this line.
TOAST_WINDOW := "New notification ahk_exe ShellExperienceHost.exe"

watching := true
lastAllowed := 0
SetTimer(CheckForPairingPopup, 400)
TrayTip("Watching for Polar pairing popups.", "Polar auto-allow")

CheckForPairingPopup() {
    global watching, lastAllowed
    if !watching
        return
    hwnd := WinExist(TOAST_WINDOW)
    if !hwnd
        return
    try {
        popup := UIA.ElementFromHandle(hwnd)
        ; Only act on popups that mention the sensor.
        if !popup.ElementExist({Name: DEVICE_WORD, MatchMode: "Substring"})
            return
        button := popup.ElementExist({Type: "Button", Name: ALLOW_LABEL})
        if !button
            return
        ; Avoid pressing twice for the same popup.
        if (A_TickCount - lastAllowed < 3000)
            return
        button.Invoke()
        lastAllowed := A_TickCount
        ToolTip("Allowed a Polar pairing request.")
        SetTimer(() => ToolTip(), -2500)
    } catch as err {
        ; The popup can vanish while we look at it; that's fine.
    }
}

; Pause or resume.
^!+p:: {
    global watching
    watching := !watching
    TrayTip(watching ? "Watching again." : "Paused.", "Polar auto-allow")
}

; Troubleshooting: list every named item in the current notification.
^!+d:: {
    hwnd := WinExist(TOAST_WINDOW)
    if !hwnd {
        MsgBox("No notification window found with:`n" TOAST_WINDOW
            . "`n`nOpen Window Spy while the popup is showing to see its real title and program.")
        return
    }
    try {
        popup := UIA.ElementFromHandle(hwnd)
        list := ""
        for item in popup.FindElements({})
            if (item.Name != "")
                list .= item.LocalizedType ": " item.Name "`n"
        MsgBox(list = "" ? "Found the window, but nothing named inside it." : list, "What the script can see")
    } catch as err {
        MsgBox("Couldn't read the notification: " err.Message)
    }
}
