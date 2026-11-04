; ============================================================================
; Popup inspector
; ----------------------------------------------------------------------------
; Hover the mouse over a popup and press Ctrl + Alt + Shift + I.
; It reports the window's title, class and program, plus every button and
; label inside it, and copies the full report to the clipboard to paste.
;
; Requires AutoHotkey v2 and UIA.ahk (from the UIA-v2 library) in this folder.
; If a report says it couldn't read the contents, right-click this script and
; choose "Run as administrator", then try again.
; ============================================================================
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include UIA.ahk

TrayTip("Hover over a popup and press Ctrl + Alt + Shift + I.", "Popup inspector")

^!+i:: {
    MouseGetPos(, , &hwnd)
    if !hwnd {
        MsgBox("No window under the mouse.")
        return
    }
    report := "Title: " WinGetTitle(hwnd)
        . "`nClass: " WinGetClass(hwnd)
        . "`nProgram: " WinGetProcessName(hwnd) "`n`n"
    try {
        report .= UIA.ElementFromHandle(hwnd).DumpAll()
    } catch as err {
        report .= "Couldn't read the window's contents: " err.Message
    }
    A_Clipboard := report
    preview := StrLen(report) > 1500 ? SubStr(report, 1, 1500) "`n…" : report
    MsgBox(preview "`n`nThe full report is on the clipboard, ready to paste.", "Popup inspector")
}
