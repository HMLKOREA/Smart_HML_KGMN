' SmartHML sync launcher - runs sync-hourly.bat with NO visible window.
' Window style 0 = hidden. bWaitOnReturn=True so Task Scheduler waits (child not killed)
' and we can propagate the real exit code -> scheduler LastResult becomes meaningful.
Set sh = CreateObject("WScript.Shell")
rc = sh.Run("cmd /c ""C:\SmartHML\web-app\scripts\sync-hourly.bat""", 0, True)
WScript.Quit rc
