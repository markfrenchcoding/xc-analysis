@echo off
setlocal

rem Registers the weekly refresh with Windows Task Scheduler. Double-click it.
rem Run it again to change the day or time - it overwrites cleanly.
rem
rem To stop it:      schtasks /delete /tn "Chute database refresh" /f
rem To run it now:   schtasks /run    /tn "Chute database refresh"
rem To see the log:  pull\last-run.log

set TASK=Chute database refresh
set WHEN=07:30
set DAY=MON

echo Registering "%TASK%" for %DAY% at %WHEN% ...
echo.

schtasks /create /tn "%TASK%" /tr "\"%~dp0refresh.cmd\"" /sc weekly /d %DAY% /st %WHEN% /f

if %ERRORLEVEL%==0 (
  echo.
  echo Done. It runs every %DAY% at %WHEN%, if the machine is on.
  echo Missed runs are not made up - it simply goes again the following week.
  echo.
  echo Try it now with:  schtasks /run /tn "%TASK%"
) else (
  echo.
  echo Could not register the task. Right-click this file and
  echo choose "Run as administrator", then try again.
)

echo.
pause
endlocal
