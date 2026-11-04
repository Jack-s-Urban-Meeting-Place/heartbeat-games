; ============================================================================
; Polar auto-pair
; ----------------------------------------------------------------------------
; Handles the three clicks needed to connect a Polar Verity Sense in Chrome:
;   1. Chrome's picker ("file:/// wants to pair"): selects the sensor, presses Pair
;   2. Windows' "Add a device" notification: taps it to start pairing
;   3. Windows' "Pair Device" prompt: presses Allow
; It only ever acts for sensors listed in APPROVED_SENSORS below, so no other
; Bluetooth device can pair with this computer through the script.
;
; Requires AutoHotkey v2 and UIA.ahk (from the UIA-v2 library) in this folder.
; The script restarts itself as administrator, because Windows hides the
; Pair Device prompt from ordinary scripts. Approve the permission request.
;
;   Ctrl + Alt + Shift + P   pause or resume
;   Ctrl + Alt + Shift + D   while the notification is showing: save what the
;                            script can see to auto-pair-debug.txt (troubleshooting)
;   Ctrl + Alt + Shift + Q   quit
; ============================================================================
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include UIA.ahk

; ---- Settings ---------------------------------------------------------------
; The ID printed after "Polar Sense" for each of your sensors. Add the second
; sensor's ID here, in quotes, separated by a comma.
APPROVED_SENSORS := ["22B4EA3A", "22B27C35"]

CHROME_PICKER := "wants to pair ahk_exe chrome.exe"
PAIR_PROMPT   := "Pair Device ahk_class ApplicationFrameWindow ahk_exe explorer.exe"
; ---------------------------------------------------------------------------

if !A_IsAdmin {
    try Run('*RunAs "' A_AhkPath '" /restart "' A_ScriptFullPath '"')
    ExitApp()
}

SetTitleMatchMode(2)      ; window titles can match partway through
paused := false
lastAction := Map()       ; window handle -> time we last acted on it

TrayTip("Ready. Approved sensors: " JoinList(APPROVED_SENSORS), "Polar auto-pair")
SetTimer(Watch, 300)

Watch() {
    if paused
        return
    HandleChromePicker()
    HandleAddDeviceNotification()
    HandlePairPrompt()
}

; ---- 2. Windows' "Add a device" notification ----------------------------------
; Notifications aren't ordinary windows, so search the shell's own surfaces
; (top-level CoreWindows) for the notification's text instead.
HandleAddDeviceNotification() {
    static lastTap := 0
    if (A_TickCount - lastTap < 5000)
        return
    try {
        root := UIA.GetRootElement()
        for surface in root.FindElements({ClassName: "Windows.UI.Core.CoreWindow"}, 2) {
            text := surface.ElementExist({Name: "Tap to set up your Polar Sense", MatchMode: "Substring"})
            if !text || !IsApproved(text.Name)
                continue
            text.Click("left")         ; a real click on the notification text
            lastTap := A_TickCount
            Notify("Tapped the Add a device notification.")
            return
        }
    }
}

; ---- 1. Chrome's sensor picker ----------------------------------------------
HandleChromePicker() {
    hwnd := WinExist(CHROME_PICKER)
    if !hwnd || RecentlyActed(hwnd)
        return
    try {
        picker := UIA.ElementFromHandle(hwnd)
        ; Collect approved sensors in the list (it fills in as Chrome scans).
        matches := []
        for item in picker.FindElements({Type: "DataItem", Name: "Polar Sense", MatchMode: "Substring"})
            if IsApproved(item.Name)
                matches.Push(item)
        ; Exactly one approved sensor: pick it. Several: leave it to a person,
        ; so Player 1 and Player 2 never get mixed up.
        if (matches.Length != 1)
            return
        sensor := matches[1]
        try sensor.Select()
        catch
            sensor.Click()
        Sleep(150)
        pairButton := picker.ElementExist({Type: "Button", Name: "Pair"})
        if !pairButton
            return
        pairButton.Invoke()
        MarkActed(hwnd)
        Notify("Selected " CleanName(sensor.Name) " in Chrome.")
    }
}

; ---- 3. Windows' Pair Device prompt -------------------------------------------
HandlePairPrompt() {
    hwnd := WinExist(PAIR_PROMPT)
    if !hwnd || RecentlyActed(hwnd)
        return
    try {
        prompt := UIA.ElementFromHandle(hwnd)
        message := prompt.ElementExist({AutomationId: "TextInstruction"})
        if !message || !IsApproved(message.Name)
            return            ; not one of our sensors: leave it for a person
        allow := prompt.ElementExist({AutomationId: "ButtonOk"})
        if !allow
            return
        allow.Invoke()
        MarkActed(hwnd)
        Notify("Allowed pairing for an approved Polar sensor.")
    }
}

; ---- Helpers ------------------------------------------------------------------
IsApproved(text) {
    if !InStr(text, "Polar Sense")
        return false
    for id in APPROVED_SENSORS
        if InStr(text, id)
            return true
    return false
}

RecentlyActed(hwnd) => lastAction.Has(hwnd) && (A_TickCount - lastAction[hwnd] < 4000)
MarkActed(hwnd) => lastAction[hwnd] := A_TickCount
CleanName(name) => RegExReplace(name, "\s*-\s*Paired$")

JoinList(list) {
    out := ""
    for item in list
        out .= (out = "" ? "" : ", ") item
    return out
}

Notify(text) {
    ToolTip(text)
    SetTimer(() => ToolTip(), -2500)
}

^!+p:: {
    global paused
    paused := !paused
    TrayTip(paused ? "Paused." : "Running again.", "Polar auto-pair")
}
; Troubleshooting: record every shell surface and its contents.
^!+d:: {
    report := "=== " FormatTime(, "HH:mm:ss") " ===`n"
    try {
        for surface in UIA.GetRootElement().FindElements({ClassName: "Windows.UI.Core.CoreWindow"}, 2) {
            report .= "`n--- Surface: " surface.Name "`n"
            try report .= surface.DumpAll() "`n"
        }
    } catch as err {
        report .= "Couldn't search the desktop: " err.Message "`n"
    }
    file := A_ScriptDir "\auto-pair-debug.txt"
    FileAppend(report, file)
    Notify("Saved to auto-pair-debug.txt")
}

^!+q:: ExitApp()
