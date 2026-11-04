; ============================================================================
; Popup logger
; ----------------------------------------------------------------------------
; Records every window that appears while it runs (title, class, program and
; the buttons and labels inside), so we can see exactly what the Windows
; pairing popups are called. The log is saved next to this script as
; popup-log.txt.
;
; Run it as administrator: right-click the script, "Run as administrator".
; Windows hides some pairing popups from scripts that aren't.
;
; Requires AutoHotkey v2 and UIA.ahk (from the UIA-v2 library) in this folder.
;
;   Ctrl + Alt + Shift + L   open the log
;   Ctrl + Alt + Shift + Q   stop logging and quit
; ============================================================================
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include UIA.ahk

logFile := A_ScriptDir "\popup-log.txt"
seen := Map()
ready := false

FileAppend("`n=== Logging started " FormatTime(, "yyyy-MM-dd HH:mm:ss")
    . " (administrator: " (A_IsAdmin ? "yes" : "NO, some popups may be hidden") ") ===`n", logFile)
TrayTip("Logging new windows. Connect your sensor now.", "Popup logger")
SetTimer(Scan, 250)

Scan() {
    global seen, ready
    current := Map()
    for hwnd in WinGetList() {
        try {
            title := WinGetTitle(hwnd)
            cls := WinGetClass(hwnd)
            exe := WinGetProcessName(hwnd)
        } catch {
            continue
        }
        key := hwnd "|" title
        current[key] := true
        if seen.Has(key)
            continue
        seen[key] := true
        if !ready          ; skip windows that were already open at the start
            continue
        entry := "`n--- " FormatTime(, "HH:mm:ss") "  Title: `"" title "`"  Class: " cls "  Program: " exe "`n"
        try {
            contents := UIA.ElementFromHandle(hwnd).DumpAll()
            entry .= StrLen(contents) > 6000 ? SubStr(contents, 1, 6000) "`n(…trimmed)`n" : contents "`n"
        } catch as err {
            entry .= "(contents unreadable: " err.Message ")`n"
        }
        FileAppend(entry, logFile)
    }
    ; Forget windows that have closed or hidden, so a reappearing popup is logged again.
    gone := []
    for key in seen
        if !current.Has(key)
            gone.Push(key)
    for key in gone
        seen.Delete(key)
    ready := true
}

^!+l:: Run(logFile)
^!+q:: {
    FileAppend("=== Logging stopped " FormatTime(, "HH:mm:ss") " ===`n", logFile)
    ExitApp()
}
