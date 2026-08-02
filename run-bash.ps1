$bash = 'C:\Program Files\Git\bin\bash.exe'
if (-not (Test-Path $bash)) {
  throw "Git Bash not found at $bash"
}
& $bash -lc $args[0]
