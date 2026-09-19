#!/usr/bin/env bash
# Cloud Agent install step for OpenIssue.dev.
# Installs dependencies from the lockfile and prepares a self-contained local
# development configuration (local libSQL database + generated dev secrets).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Installing npm dependencies (npm ci)..."
npm ci

bash "$REPO_ROOT/.cursor/setup-env.sh"

echo "Install complete."
