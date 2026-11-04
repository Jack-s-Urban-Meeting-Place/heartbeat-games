; ============================================================================
; Heartbeat Games launcher
; ----------------------------------------------------------------------------
; Gets everything running from one shortcut:
;   1. Opens heartbeat-games.html in Chrome, full screen, in its own profile
;   2. Asks the page to connect Player 1, then Player 2 (retrying if needed)
;   3. Watches the page the whole time. Whenever a player is connecting, at
;      startup or when the page reconnects a sensor that dropped out, it:
;        - picks the sensor in Chrome's picker and presses Pair
;        - taps Windows' "Add a device" notification
;        - presses Allow on the "Pair Device" prompt
;        - hides the Pairing and Settings windows, waits for pairing to finish,
;          closes them, and tells the page to carry on
;      It only ever acts for the sensors listed in config.js.
;
; Keep these together in one folder (setup.bat creates the desktop shortcut):
;   heartbeat-launcher.ahk, UIA.ahk, heartbeat-games.html, config.js, js\, games\
;   (UIA.ahk is downloaded separately: see GET-UIA.txt)
;
; Staff shortcuts:
;   Ctrl + Alt + Shift + R   connect any player that isn't connected
;   Ctrl + Alt + Shift + X   closing time: disconnect sensors, close Chrome, quit
;   Alt + F4 (on the games)  the same tidy close
;   Ctrl + Alt + Shift + P   pause or resume the popup helper
;   Ctrl + Alt + Shift + D   save the Pairing window's contents to the log
; ============================================================================
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include *i UIA.ahk   ; "*i": if it's missing, carry on to the clear message below instead of AutoHotkey's own error
; Without UIA.ahk, AutoHotkey would first pop up a confusing warning ("UIA ... never assigned a value") and
; stop there. Send that kind of warning to the debugger instead (DebugView shows it), so the message below shows.
#Warn VarUnset, OutputDebug

; UIA.ahk is a free library from another project (UIA-v2), downloaded separately: see GET-UIA.txt.
if !FileExist(A_ScriptDir "\UIA.ahk") {
    MsgBox("Heartbeat Games can't start: the file UIA.ahk is missing.`n`n"
        . "Download it from:`nhttps://raw.githubusercontent.com/Descolada/UIA-v2/main/Lib/UIA.ahk`n`n"
        . "and put it in this folder, next to heartbeat-launcher.ahk:`n" A_ScriptDir "`n`n"
        . "Step-by-step instructions are in GET-UIA.txt in that folder.", "Heartbeat Games", "Icon!")
    ExitApp()
}

; ---- Settings ---------------------------------------------------------------
CONFIG_FILE := A_ScriptDir "\config.js"
PAGE_FILE := A_ScriptDir "\heartbeat-games.html"
LOG_FILE := A_ScriptDir "\heartbeat-log.txt"
PAGE_CANDIDATES := "Heartbeat Games ahk_exe chrome.exe"   ; narrowed down by GamesWindow()
PROFILE_DIR := A_ScriptDir "\chrome-profile"              ; the launcher's own Chrome profile
CHROME_PICKER := "wants to pair ahk_exe chrome.exe"
PAIR_PROMPT := "Pair Device ahk_class ApplicationFrameWindow ahk_exe explorer.exe"
SETTINGS_WINDOW := "Settings ahk_class ApplicationFrameWindow ahk_exe ApplicationFrameHost.exe"
ATTEMPTS_PER_PLAYER := 3
PAIRING_TIMEOUT := 140000          ; longest wait for Windows to finish pairing (ms)
LATE_PAIRING_WAIT := 12000         ; wait this long (ms) for a Pairing window before assuming none is coming
KEEP_AWAKE := true                 ; stop the laptop sleeping (and the screen turning off) while the games run
HIDE_SYSTEM_WINDOWS := true        ; keep the Pairing and Settings windows out of sight
; ---------------------------------------------------------------------------

; Windows hides its pairing prompt from scripts without administrator rights.
; The desktop shortcut runs this through Task Scheduler with those rights.
if !A_IsAdmin {
    try Run('*RunAs "' A_AhkPath '" /restart "' A_ScriptFullPath '"')
    ExitApp()
}

SetTitleMatchMode(2)
PLAYER_SENSOR := Map()             ; player number -> sensor ID, filled from config.js
APPROVED_SENSORS := ReadSensorIds()
paused := false
connectingNow := false             ; true while the page reports a player connecting
settingsBefore := []               ; Settings windows already open before this connection
hiddenWindows := Map()
lastAction := Map()
episode := NewEpisode(0)           ; what we know about the current connection
pairSensor := ""                   ; the sensor the Pairing window is pairing, if it says
lastNote := ""                     ; the page's last problem report, already logged
gamesHwnd := 0                     ; the games window, once found

WriteLog("=== Launcher started. Approved sensors: " JoinList(APPROVED_SENSORS) " ===")
; Sleep switches Bluetooth off and drops both sensors, so ask Windows to stay awake,
; the way a video player does. No settings change: normal sleep returns when the launcher quits.
if KEEP_AWAKE
    DllCall("SetThreadExecutionState", "UInt", 0x80000003)   ; continuous + system + display required
SetTimer(WatchPopups, 300)
SetTimer(Monitor, 250)
StartGames()

; ============================================================================
; Settings from config.js
; ============================================================================
ReadSensorIds() {
    ids := []
    try text := FileRead(CONFIG_FILE, "UTF-8")
    catch {
        MsgBox("Can't read the settings file:`n" CONFIG_FILE, "Heartbeat Games", "Icon!")
        ExitApp()
    }
    if RegExMatch(text, "s)sensors\s*:\s*\{([^}]*)\}", &block) {
        pos := 1
        while (pos := RegExMatch(block[1], '(?:(\d+)\s*:\s*)?"([0-9A-Fa-f]{8})"', &m, pos)) {
            ids.Push(StrUpper(m[2]))
            PLAYER_SENSOR[m[1] != "" ? Integer(m[1]) : ids.Length] := StrUpper(m[2])
            pos += m.Len
        }
    }
    if !ids.Length {
        MsgBox("No sensor IDs found in config.js. Each should be 8 characters in quotes.", "Heartbeat Games", "Icon!")
        ExitApp()
    }
    return ids
}

; ============================================================================
; Startup
; ============================================================================
StartGames() {
    if !FileExist(PAGE_FILE) {
        MsgBox("Can't find the games page:`n" PAGE_FILE "`n`nKeep all the Heartbeat Games files in one folder.", "Heartbeat Games", "Icon!")
        ExitApp()
    }
    if !GamesWindow() {
        chrome := FindChrome()
        if !chrome {
            MsgBox("Google Chrome isn't installed on this computer.", "Heartbeat Games", "Icon!")
            ExitApp()
        }
        profile := A_ScriptDir "\chrome-profile"
        Run('"' chrome '" --kiosk --user-data-dir="' profile '" --no-first-run --no-default-browser-check "' FileUrl(PAGE_FILE) '"')
        deadline := A_TickCount + 60000
        while !GamesWindow() {
            if (A_TickCount > deadline) {
                MsgBox("Chrome didn't open the games page. Close Chrome and try the shortcut again.", "Heartbeat Games", "Icon!")
                return
            }
            Sleep(500)
        }
        WriteLog("Games window opened")
        Sleep(2500)
    }
    ConnectAll()
}

ConnectAll() {
    ok1 := ConnectPlayer(1)
    ok2 := ConnectPlayer(2)
    if (ok1 && ok2)
        TrayTip("Both sensors are connected.", "Heartbeat Games")
    else
        TrayTip("A sensor didn't connect. Check it's on, then press Ctrl + Alt + Shift + R.", "Heartbeat Games", "Icon!")
}

; Asks the page to connect one player (F1 / F2) and waits for the result. The
; popups are handled by Monitor and WatchPopups in the background meanwhile.
ConnectPlayer(n) {
    Loop ATTEMPTS_PER_PLAYER {
        state := PlayerState(n)
        if (state = "ready")
            return true
        if !(state = "connecting" || state = "settling" || state = "reconnecting") {
            WriteLog("Player " n ": asking the page to connect (attempt " A_Index ")")
            ActivateGames()
            Send("^!+{F" n "}")
            Sleep(1000)
        }
        result := WaitForPlayer(n)
        if (result = "ready")
            return true
        if (result = "reconnecting")
            return false                ; the page is retrying by itself
        Sleep(3000)
    }
    return false
}

WaitForPlayer(n) {
    deadline := A_TickCount + 240000
    while (A_TickCount < deadline) {
        state := PlayerState(n)
        if (state = "ready" || state = "failed" || state = "idle" || state = "reconnecting")
            return state
        Sleep(250)
    }
    return "timeout"
}

PlayerState(n) {
    if !(w := GamesWindow())
        return ""
    try title := WinGetTitle(w)
    catch
        return ""
    return RegExMatch(title, "P" n ":(\w+)", &m) ? m[1] : ""
}

; The step the page is on while connecting, e.g. "pairing" from "P1:connecting-pairing".
PlayerStep(n) {
    if !(w := GamesWindow())
        return ""
    try title := WinGetTitle(w)
    catch
        return ""
    return RegExMatch(title, "P" n ":\w+-(\w+)", &m) ? m[1] : ""
}

; The games window: Chrome, with a title starting "Heartbeat Games | P1:", in the
; launcher's own Chrome profile. Anything else, such as the games page open in
; everyday Chrome or a test tool, is ignored.
GamesWindow() {
    global gamesHwnd
    static rejected := Map()       ; windows from other Chrome profiles, checked once
    if gamesHwnd {
        try {
            if WinExist("ahk_id " gamesHwnd) && IsGamesTitle(WinGetTitle("ahk_id " gamesHwnd))
                return "ahk_id " gamesHwnd
        }
        gamesHwnd := 0
    }
    for hwnd in WinGetList(PAGE_CANDIDATES) {
        if rejected.Has(hwnd)
            continue
        try {
            if !IsGamesTitle(WinGetTitle(hwnd))
                continue
            if !InStr(ProcessCommandLine(WinGetPID(hwnd)), PROFILE_DIR) {
                rejected[hwnd] := true
                WriteLog("Ignoring a games-like window that isn't the launcher's own: " WinGetTitle(hwnd))
                continue
            }
            gamesHwnd := hwnd
            return "ahk_id " hwnd
        }
    }
    return ""
}

IsGamesTitle(title) => RegExMatch(title, "^Heartbeat Games \| P1:")

GamesActive() {
    w := GamesWindow()
    return w && WinActive(w)
}

ActivateGames() {
    if !(w := GamesWindow())
        return
    try {
        WinActivate(w)
        WinWaitActive(w, , 5)
    }
}

ProcessCommandLine(pid) {
    try {
        for proc in ComObjGet("winmgmts:").ExecQuery("SELECT CommandLine FROM Win32_Process WHERE ProcessId=" pid)
            return proc.CommandLine
    }
    return ""
}

FindChrome() {
    for path in [A_ProgramFiles "\Google\Chrome\Application\chrome.exe",
                 EnvGet("ProgramFiles(x86)") "\Google\Chrome\Application\chrome.exe",
                 EnvGet("LocalAppData") "\Google\Chrome\Application\chrome.exe"]
        if FileExist(path)
            return path
    return ""
}

FileUrl(path) => "file:///" StrReplace(StrReplace(path, "\", "/"), " ", "%20")

; ============================================================================
; Monitor: follows the page's title and steers each connection through pairing
; ============================================================================
NewEpisode(n) => ({player: n, started: A_TickCount, sawPairing: false, pairingDone: false, settlingSince: 0, sentStart: false, step: ""})

Monitor() {
    global connectingNow, settingsBefore, episode
    busy := 0, busyState := ""
    for n in [1, 2] {
        state := PlayerState(n)
        if (state = "connecting" || state = "settling") {
            busy := n
            busyState := state
        }
    }
    ; A connection started, finished, or moved to the other player.
    if (busy != episode.player) {
        if episode.player {
            CloseLeftovers()
            WriteLog("Player " episode.player ": connection step finished after " Round((A_TickCount - episode.started) / 1000) " s")
        }
        episode := NewEpisode(busy)
        if busy {
            settingsBefore := WinGetList(SETTINGS_WINDOW)
            WriteLog("Player " busy ": connecting")
        }
    }
    connectingNow := busy != 0
    LogPageNote()
    if !busy {
        ; A Pairing window left running for a player whose connection moved on: close it once Windows is finished.
        if WinExist(PAIR_PROMPT) {
            pairing := PairWindowState()
            if (pairing = "done" || pairing = "failed")
                CloseLeftovers()
        }
        return
    }

    ; Record each step the page reports, so a stuck connection shows where it stopped.
    step := PlayerStep(busy)
    if (step != episode.step) {
        WriteLog("Player " busy ": page step " (step = "" ? "(none)" : step) " at " Round((A_TickCount - episode.started) / 1000) " s")
        episode.step := step
    }

    ; Watch the Pairing window and close it as soon as Windows has finished.
    ; A window for the other player's sensor doesn't belong to this connection.
    if !episode.pairingDone {
        pairing := PairWindowState()
        mine := pairing != "none" && (pairSensor = "" || pairSensor = PLAYER_SENSOR.Get(busy, ""))
        if mine
            episode.sawPairing := true
        if (pairing = "done" || pairing = "failed") {
            if mine {
                episode.pairingDone := true
                WriteLog("Player " busy ": pairing " pairing " after " Round((A_TickCount - episode.started) / 1000) " s")
            }
            CloseLeftovers()
        }
    }

    ; While the page waits ("settling"), give it the go-ahead once pairing is done,
    ; or if no Pairing window has appeared after a short wait (after the laptop
    ; wakes, Windows can show it several seconds late), or after the timeout.
    if (busyState = "settling" && !episode.sentStart) {
        if !episode.settlingSince
            episode.settlingSince := A_TickCount
        waited := A_TickCount - episode.settlingSince
        stillPairing := !episode.pairingDone && episode.sawPairing && WinExist(PAIR_PROMPT)
        windowMayCome := !episode.sawPairing && waited < LATE_PAIRING_WAIT
        if ((!stillPairing && !windowMayCome) || waited > PAIRING_TIMEOUT) {
            if stillPairing
                WriteLog("Player " busy ": gave up waiting for the Pairing window")
            else if !episode.sawPairing
                WriteLog("Player " busy ": no Pairing window appeared within " Round(LATE_PAIRING_WAIT / 1000) " s")
            CloseLeftovers()
            Sleep(300)
            ActivateGames()
            Send("^!+{F3}")
            episode.sentStart := true
            WriteLog("Player " busy ": told the page to start motion")
        }
    }
}

; "none" (no Pairing window), "working", "done" or "failed". Also notes which
; sensor the window is pairing, in pairSensor ("" if it doesn't say).
PairWindowState() {
    global pairSensor
    static lastText := ""
    hwnd := WinExist(PAIR_PROMPT)
    if !hwnd
        return "none"
    text := ""
    try {
        window := UIA.ElementFromHandle(hwnd)
        try items := window.FindElements()
        catch
            items := window.FindElements({Type: "Text"})
        for item in items
            if (item.Name != "")
                text .= item.Name " | "
    } catch {
        return "working"
    }
    if (text != lastText) {
        WriteLog("Pairing window: " text)
        lastText := text
    }
    pairSensor := ""
    for id in APPROVED_SENSORS
        if InStr(text, id)
            pairSensor := id
    if RegExMatch(text, "i)failed|couldn.t|could not|try again|timed out|not available")
        return "failed"
    if RegExMatch(text, "i)succeeded|successful|ready to go|is connected|now connected")
        return "done"
    ; Windows doesn't expose the words "connection succeeded" to scripts; the
    ; window switching away from the Allow question to just the sensor's name
    ; is the sign that pairing has finished (about 60 seconds after Allow).
    if IsApproved(text) && !InStr(text, "Do you want to allow") && !InStr(text, "Pair device?")
        return "done"
    return "working"
}

; Close the Pairing window and any Settings window that opened during this connection.
; Never while Windows is still pairing another player's sensor: closing it before
; pairing finishes breaks that sensor's connection.
CloseLeftovers() {
    static spared := ""
    if (hwnd := WinExist(PAIR_PROMPT)) {
        if (PairWindowState() = "working" && pairSensor != "" && pairSensor != PLAYER_SENSOR.Get(episode.player, "")) {
            if (pairSensor != spared)
                WriteLog("Left the Pairing window open: Windows is still pairing sensor " pairSensor)
            spared := pairSensor
            return
        }
        spared := ""
        closed := false
        try {
            window := UIA.ElementFromHandle(hwnd)
            for name in ["Done", "Close", "OK"] {
                if (button := window.ElementExist({Type: "Button", Name: name})) {
                    button.Invoke()
                    closed := true
                    break
                }
            }
        }
        if !closed
            try WinClose(hwnd)
        WriteLog("Closed the Pairing window")
    }
    for hwnd in WinGetList(SETTINGS_WINDOW) {
        if !InList(settingsBefore, hwnd) {
            try WinClose(hwnd)
            WriteLog("Closed the Settings window opened by pairing")
        }
    }
}

; The page puts its latest problem in the window title, numbered, e.g.
; "... | note 3 P2 Reconnect attempt failed - ...". Copy each new one into the log.
LogPageNote() {
    global lastNote
    if !(w := GamesWindow())
        return
    try title := WinGetTitle(w)
    catch
        return
    if !RegExMatch(title, "\| note (\d+) (P\d|app) (.*)$", &m) || m[1] = lastNote
        return
    missed := (lastNote != "" && m[1] > lastNote + 1) ? " (" (m[1] - lastNote - 1) " earlier message(s) not caught)" : ""
    lastNote := m[1]
    WriteLog("Page, " (m[2] = "app" ? "games" : "Player " SubStr(m[2], 2)) ": " m[3] missed)
}

; ============================================================================
; Popup helper
; ============================================================================
WatchPopups() {
    if paused
        return
    HandleChromePicker()
    if connectingNow {                 ; the desktop-wide search is the heaviest step
        HandleAddDeviceNotification()
        if HIDE_SYSTEM_WINDOWS
            HideSystemWindows()
    }
    HandlePairPrompt()
}

; 1. Chrome's picker: the page asks for one sensor by name, so expect one entry.
;    If the sensor doesn't appear within 25 seconds (switched off, out of range),
;    press Cancel so the page can report it and try again.
HandleChromePicker() {
    static pickerSince := 0, pickerHwnd := 0
    hwnd := WinExist(CHROME_PICKER)
    if (hwnd != pickerHwnd)
        pickerHwnd := hwnd, pickerSince := A_TickCount
    if !hwnd || RecentlyActed(hwnd)
        return
    try {
        picker := UIA.ElementFromHandle(hwnd)
        matches := []
        for item in picker.FindElements({Type: "DataItem", Name: "Polar Sense", MatchMode: "Substring"})
            if IsApproved(item.Name)
                matches.Push(item)
        if (matches.Length = 0 && A_TickCount - pickerSince > 25000) {
            if (cancel := picker.ElementExist({Type: "Button", Name: "Cancel"})) {
                cancel.Invoke()
                MarkActed(hwnd)
                WriteLog("Sensor didn't appear in Chrome's list within 25 s; cancelled")
            }
            return
        }
        if (matches.Length != 1)
            return
        sensor := matches[1]
        try sensor.Select()
        catch
            sensor.Click()
        Sleep(150)
        if (pairButton := picker.ElementExist({Type: "Button", Name: "Pair"})) {
            pairButton.Invoke()
            MarkActed(hwnd)
        }
    }
}

; 2. Windows' "Add a device. Tap to set up your Polar Sense ..." notification.
HandleAddDeviceNotification() {
    static lastTap := 0
    if (A_TickCount - lastTap < 5000)
        return
    try {
        for surface in UIA.GetRootElement().FindElements({ClassName: "Windows.UI.Core.CoreWindow"}, 2) {
            text := surface.ElementExist({Name: "Tap to set up your Polar Sense", MatchMode: "Substring"})
            if !text || !IsApproved(text.Name)
                continue
            text.Click("left")
            lastTap := A_TickCount
            return
        }
    }
}

; 3. Windows' "Pair Device" prompt: Allow, only for approved sensors.
HandlePairPrompt() {
    hwnd := WinExist(PAIR_PROMPT)
    if !hwnd || RecentlyActed(hwnd)
        return
    try {
        prompt := UIA.ElementFromHandle(hwnd)
        message := prompt.ElementExist({AutomationId: "TextInstruction"})
        if !message || !IsApproved(message.Name)
            return
        allow := prompt.ElementExist({AutomationId: "ButtonOk"})
        if allow && (allow.Name = "Allow") {        ; never a "Done" button that would end pairing early
            allow.Invoke()
            MarkActed(hwnd)
            WriteLog("Allowed pairing: " message.Name)
        }
    }
}

; Move the Pairing window and the Settings window it opens off-screen and make
; them invisible, then bring the games back to the front. They keep running
; (minimising could pause them), and the script can still read and press them.
HideSystemWindows() {
    targets := []
    for hwnd in WinGetList(PAIR_PROMPT)
        targets.Push(hwnd)
    for hwnd in WinGetList(SETTINGS_WINDOW)
        if !InList(settingsBefore, hwnd)
            targets.Push(hwnd)
    hidAny := false
    for hwnd in targets {
        if hiddenWindows.Has(hwnd)
            continue
        try {
            WinSetTransparent(0, hwnd)
            WinMove(-20000, -20000, , , hwnd)
            hiddenWindows[hwnd] := true
            hidAny := true
        }
    }
    if hidAny
        ActivateGames()
}

; ============================================================================
; Small helpers
; ============================================================================
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

InList(list, value) {
    for item in list
        if (item = value)
            return true
    return false
}

JoinList(list) {
    out := ""
    for item in list
        out .= (out = "" ? "" : ", ") item
    return out
}

WriteLog(message) {
    try FileAppend(FormatTime(, "yyyy-MM-dd HH:mm:ss") "  " message "`n", LOG_FILE)
}

CloseGames() {
    if (w := GamesWindow()) {
        WriteLog("Closing: returning sensors to normal mode")
        ActivateGames()
        Send("^!+{F4}")              ; page returns both sensors to normal mode
        Sleep(3000)
        try WinClose(w)
    }
    ExitApp()
}

; ============================================================================
; Staff shortcuts
; ============================================================================
^!+r:: ConnectAll()
^!+x:: CloseGames()

#HotIf GamesActive()
!F4:: CloseGames()
#HotIf

^!+p:: {
    global paused
    paused := !paused
    TrayTip(paused ? "Popup helper paused." : "Popup helper running.", "Heartbeat Games")
}

^!+d:: {
    hwnd := WinExist(PAIR_PROMPT)
    if !hwnd {
        WriteLog("Snapshot: no Pairing window is open.")
        TrayTip("No Pairing window is open.", "Heartbeat Games")
        return
    }
    try {
        WriteLog("Snapshot of the Pairing window:`n" UIA.ElementFromHandle(hwnd).DumpAll())
        TrayTip("Saved the Pairing window to heartbeat-log.txt.", "Heartbeat Games")
    } catch as err {
        WriteLog("Snapshot failed: " err.Message)
    }
}
