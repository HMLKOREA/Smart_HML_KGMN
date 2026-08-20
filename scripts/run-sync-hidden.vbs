' SmartHML sync launcher - runs sync-hourly.bat with NO visible window.
' Window style 0 = hidden. Used by scheduled tasks to avoid CMD flashing.
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c ""C:\SmartHML\web-app\scripts\sync-hourly.bat""", 0, False
