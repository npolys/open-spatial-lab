# Ubuntu / bash self-contained setup

This directory provides a repo-local bootstrap for running the Open Spatial Lab smoke and spike tooling from a Unix-style shell without depending on the host OS path layout.

## Files
- env.sh: defines repo-relative paths and runtime directories.
- run-bash.sh: starts a bash shell with the repo environment loaded.
- launch.sh: launches the demo using the repo-local shell environment.
- stop.sh: stops the demo using the repo-local shell environment.
- run-with-recovery.sh: clears stale listeners on the Ubuntu-side ports and launches the demo from the repo root.

## Usage

From the repository root:

```bash
bash tools/ubuntu/run-bash.sh
```

Or launch directly:

```bash
bash tools/ubuntu/launch.sh
```

## Required tools
Install the following in the Ubuntu environment:
- bash
- nodejs (22.x)
- npm (10.x)
- curl
- lsof
- sed

## Recommended environment

```bash
export OSL_REPO_ROOT="$PWD"
export OSL_RUNTIME_DIR="$PWD/.runtime"
export OSL_BASH_PATH="/usr/bin/bash"
```
