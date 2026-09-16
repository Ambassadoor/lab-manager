@echo off
REM Installs the bridge as a Windows service using NSSM, so it starts
REM automatically at boot (before anyone logs in), restarts itself if it
REM crashes, and runs with no visible console window.
REM
REM Prerequisite: download NSSM from https://nssm.cc/ and either add
REM nssm.exe to PATH, or copy it into this scripts\ folder.
REM
REM Run this from an elevated (Run as Administrator) Command Prompt, after
REM `poetry install --no-root` has already been run once in bridge\.

setlocal
set SERVICE_NAME=LabManagerBridge
set SCRIPT_DIR=%~dp0
set BRIDGE_DIR=%SCRIPT_DIR%..
set PYTHON_EXE=%BRIDGE_DIR%\.venv\Scripts\python.exe

where nssm >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%SCRIPT_DIR%nssm.exe" (
        set PATH=%SCRIPT_DIR%;%PATH%
    ) else (
        echo nssm.exe not found on PATH or in this folder.
        echo Download it from https://nssm.cc/ and either add it to PATH
        echo or copy nssm.exe next to this script, then run this again.
        exit /b 1
    )
)

if not exist "%PYTHON_EXE%" (
    echo Could not find %PYTHON_EXE%
    echo Run "poetry install --no-root" in %BRIDGE_DIR% first.
    exit /b 1
)

REM Safe to run again to reconfigure — stop/remove any existing install first.
nssm stop %SERVICE_NAME% >nul 2>nul
nssm remove %SERVICE_NAME% confirm >nul 2>nul

REM 127.0.0.1 only, not 0.0.0.0 — the frontend reaches this on localhost;
REM it isn't meant to be reachable from other machines on the network.
nssm install %SERVICE_NAME% "%PYTHON_EXE%" "-m uvicorn app.main:app --host 127.0.0.1 --port 8200"
nssm set %SERVICE_NAME% AppDirectory "%BRIDGE_DIR%"
nssm set %SERVICE_NAME% DisplayName "Lab Manager Bridge"
nssm set %SERVICE_NAME% Description "USB balance + Brother label printer bridge for the Lab Manager app."
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppStdout "%BRIDGE_DIR%\service.log"
nssm set %SERVICE_NAME% AppStderr "%BRIDGE_DIR%\service.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateBytes 1048576
nssm set %SERVICE_NAME% AppExit Default Restart

nssm start %SERVICE_NAME%

echo.
echo Installed and started "%SERVICE_NAME%".
echo   Status:  nssm status %SERVICE_NAME%   (or check services.msc)
echo   Logs:    %BRIDGE_DIR%\service.log
echo   Remove:  scripts\uninstall_service.bat
endlocal
