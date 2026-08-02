@echo off
setlocal
set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if exist "%BASH_EXE%" (
  "%BASH_EXE%" %*
) else (
  bash.exe %*
)
