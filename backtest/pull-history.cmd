@echo off
setlocal

rem Every Oregon school's 2022-2025 seasons, for backtesting all five
rem classifications. A one-off: double-click it, or let the Monday refresh run
rem it once (it does, while backtest\hist\2025-results.csv.gz does not exist).
rem
rem About 45 minutes. It can be stopped and started again: what it has already
rem read is kept and not asked for twice. When it finishes it commits
rem backtest\hist and pushes, and nothing else.

cd /d "%~dp0.."
set LOG=%~dp0pull-history.log
echo ============================================= >> "%LOG%"
echo %DATE% %TIME% >> "%LOG%"

if /i not "%1"=="auto" git pull --ff-only origin main
if /i not "%1"=="auto" echo Pulling 2022-2025 for every classification. About 45 minutes.

node backtest\pull_history.js >> "%LOG%" 2>&1
set CODE=%ERRORLEVEL%

if not exist backtest\hist\tree.json goto :failed

git add backtest\hist
git diff --cached --quiet -- backtest\hist
if %ERRORLEVEL%==0 goto :report
git commit -m "Backtest history: every classification, 2022-2025" -m "Pulled by backtest/pull-history.cmd. Exit %CODE%; see backtest/pull-history.log on the machine that ran it." >> "%LOG%" 2>&1
git push origin main >> "%LOG%" 2>&1
echo pushed >> "%LOG%"

:report
if %CODE%==0 (
  echo All four seasons pulled and pushed. >> "%LOG%"
  if /i not "%1"=="auto" echo Done. All four seasons pulled and pushed.
) else (
  echo Some seasons were refused - run it again, it carries on where it stopped. >> "%LOG%"
  if /i not "%1"=="auto" echo Some seasons need another go. Double-click it again; it carries on where it stopped.
)
goto :done

:failed
echo pull failed with %CODE% >> "%LOG%"
if /i not "%1"=="auto" echo It could not reach athletic.net. Details in backtest\pull-history.log.

:done
echo exit %CODE% >> "%LOG%"
if /i not "%1"=="auto" pause
endlocal
