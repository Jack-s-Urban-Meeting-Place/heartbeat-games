# ============================================================================
# Heartbeat Games: one-time setup
# Registers the launcher with Task Scheduler (so it runs with the rights it
# needs, without a permission prompt each time) and creates the
# "Start Heartbeat Games" shortcut on the desktop.
# Run it through setup.bat. Run it again after moving the folder.
# ============================================================================

# Ask for administrator rights if we don't have them yet.
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

function Fail($message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$here = Split-Path -Parent $PSCommandPath
$launcher = Join-Path $here "heartbeat-launcher.ahk"

Write-Host "Heartbeat Games setup" -ForegroundColor Cyan
Write-Host "Folder: $here"

# UIA.ahk comes from another project (UIA-v2), so it isn't in the download: offer to fetch it.
# The link and the manual steps are in GET-UIA.txt.
$uia = Join-Path $here "UIA.ahk"
$uiaLink = "https://raw.githubusercontent.com/Descolada/UIA-v2/main/Lib/UIA.ahk"
if (-not (Test-Path $uia)) {
    Write-Host ""
    Write-Host "UIA.ahk is missing. The launcher needs it to click through the Bluetooth pairing popups." -ForegroundColor Yellow
    Write-Host "It's a free library from the UIA-v2 project: $uiaLink"
    $get = Read-Host "Download it into this folder now? (y/n)"
    if ($get -match '^[Yy]') {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $uiaLink -OutFile $uia -UseBasicParsing
            Write-Host "Downloaded UIA.ahk." -ForegroundColor Green
        } catch {
            if (Test-Path $uia) { Remove-Item $uia }
            Fail "Couldn't download UIA.ahk ($($_.Exception.Message)). Follow the steps in GET-UIA.txt, then run setup again."
        }
    } else {
        Fail "Download UIA.ahk and put it in this folder (steps in GET-UIA.txt), then run setup again."
    }
}

# Check the files are all here.
foreach ($file in @("heartbeat-launcher.ahk", "UIA.ahk", "heartbeat-games.html", "config.js", "js\sensor.js", "js\app.js", "js\vendor\three.min.js")) {
    if (-not (Test-Path (Join-Path $here $file))) {
        Fail "Missing $file. Put all the Heartbeat Games files in this folder, then run setup again."
    }
}

# Find AutoHotkey v2.
$candidates = @(
    "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe",
    "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey.exe",
    "$env:ProgramFiles\AutoHotkey\AutoHotkey64.exe",
    "$env:LOCALAPPDATA\Programs\AutoHotkey\v2\AutoHotkey64.exe"
)
$ahk = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $ahk) { Fail "AutoHotkey v2 isn't installed. Install it from autohotkey.com, then run setup again." }
Write-Host "AutoHotkey: $ahk"

# Find Chrome (the launcher needs it).
$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Fail "Google Chrome isn't installed. Install it, then run setup again." }

# Optional: start automatically when this user signs in.
$auto = Read-Host "Start Heartbeat Games automatically when $env:USERNAME signs in? (y/n)"

# Register the task: runs the launcher with the highest rights, for this user, on their desktop.
$action = New-ScheduledTaskAction -Execute $ahk -Argument "`"$launcher`"" -WorkingDirectory $here
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$params = @{ TaskName = "Heartbeat Games"; Action = $action; Principal = $principal; Settings = $settings; Force = $true }
if ($auto -match '^[Yy]') {
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $trigger.Delay = "PT20S"          # give Windows and Bluetooth a moment after sign-in
    $params.Trigger = $trigger
}
try { Register-ScheduledTask @params | Out-Null }
catch { Fail "Couldn't register the task: $($_.Exception.Message)" }
Write-Host "Registered the 'Heartbeat Games' task." -ForegroundColor Green

# Desktop shortcut that starts the task (no permission prompt needed).
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop "Start Heartbeat Games.lnk"))
$shortcut.TargetPath = "$env:SystemRoot\System32\schtasks.exe"
$shortcut.Arguments = '/run /tn "Heartbeat Games"'
$shortcut.WindowStyle = 7             # minimised, so no console window flashes up
$shortcut.IconLocation = "$chrome,0"
$shortcut.Description = "Opens Heartbeat Games and connects both sensors"
$shortcut.Save()
Write-Host "Created 'Start Heartbeat Games' on the desktop." -ForegroundColor Green

Write-Host ""
Write-Host "All done. Turn on both sensors, then double-click 'Start Heartbeat Games'." -ForegroundColor Cyan
Read-Host "Press Enter to close"
