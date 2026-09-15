@echo off
setlocal

rem Weekly database refresh, for Windows Task Scheduler.
rem
rem Crawls athletic.net, rewrites index.html, and pushes. Vercel redeploys on
rem the push, so the site updates with nobody watching. Register it with:
rem
rem   pull\install-schedule.cmd
rem
rem Exit codes from crawl.js: 0 wrote a new database, 2 refused to write because
rem something looked wrong, 3 nothing had changed since last time. Only 0 is
rem committed; 2 and 3 are both left alone deliberately.

cd /d "%~dp0.."

set LOG=%~dp0last-run.log
echo ============================================= >> "%LOG%"
echo %DATE% %TIME% >> "%LOG%"

node pull\crawl.js >> "%LOG%" 2>&1
set CODE=%ERRORLEVEL%

if %CODE%==3 goto :nothing
if %CODE%==2 goto :refused
if not %CODE%==0 goto :failed

rem Freeze what the board now says, before the coming Saturday. Only on exit 0:
rem an unchanged database would predict exactly what last week predicted, and an
rem archive of identical rows proves nothing it did not already prove.
node backtest\snapshot.js >> "%LOG%" 2>&1
if not %ERRORLEVEL%==0 echo snapshot refused or failed - see above >> "%LOG%"

rem Only index.html is ever committed. If anything else is dirty the run leaves
rem it alone rather than sweeping a half-finished edit into an unattended commit.
git diff --quiet -- index.html
if %ERRORLEVEL%==0 (
  echo crawl reported success but index.html is unchanged >> "%LOG%"
  goto :done
)

rem crawl.js writes the message itself - batch quoting around a nested node -e
rem is its own small horror, and it already has the figures.
git add index.html
git commit -F "%~dp0.commit-msg" >> "%LOG%" 2>&1
git push origin main >> "%LOG%" 2>&1
echo pushed >> "%LOG%"
goto :done

:nothing
echo nothing changed, nothing to commit >> "%LOG%"
goto :done

:refused
echo crawl refused to write - see above >> "%LOG%"
goto :done

:failed
echo crawl failed with %CODE% >> "%LOG%"

:done
echo exit %CODE% >> "%LOG%"
endlocal
