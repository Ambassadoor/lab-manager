@echo off
REM Stops and removes the LabManagerBridge Windows service installed by
REM install_service.bat. Run from an elevated (Run as Administrator)
REM Command Prompt.

setlocal
set SERVICE_NAME=LabManagerBridge

where nssm >nul 2>nul
if %errorlevel% neq 0 (
    set SCRIPT_DIR=%~dp0
    if exist "%SCRIPT_DIR%nssm.exe" (
        set PATH=%SCRIPT_DIR%;%PATH%
    ) else (
        echo nssm.exe not found on PATH or in this folder.
        exit /b 1
    )
)

nssm stop %SERVICE_NAME%
nssm remove %SERVICE_NAME% confirm
echo Removed "%SERVICE_NAME%".
endlocal
