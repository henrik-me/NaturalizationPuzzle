#!/usr/bin/env bash
# Builds the production Docker image, runs it, and executes the full Playwright
# suite against the running container (PLAYWRIGHT_BASE_URL=http://localhost:<port>).
#
# Pre-push reproducer for Docker-context-only bugs the dev-stack E2E cannot
# catch (e.g., missing-from-build-context embedded resources — see PR #81
# silent-empty-stories incident).

set -euo pipefail

IMAGE_NAME="natpuzzle"
IMAGE_TAG="local"
PORT=8080
HEALTH_TIMEOUT=60
SKIP_BUILD=0
PLAYWRIGHT_ARGS=()

usage() {
    cat <<EOF
Usage: $0 [--image-name NAME] [--image-tag TAG] [--port N]
          [--health-timeout SECONDS] [--skip-build]
          [-- <args forwarded to npx playwright test>]
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --image-name)     IMAGE_NAME="$2"; shift 2 ;;
        --image-tag)      IMAGE_TAG="$2"; shift 2 ;;
        --port)           PORT="$2"; shift 2 ;;
        --health-timeout) HEALTH_TIMEOUT="$2"; shift 2 ;;
        --skip-build)     SKIP_BUILD=1; shift ;;
        -h|--help)        usage; exit 0 ;;
        --)               shift; PLAYWRIGHT_ARGS=("$@"); break ;;
        *)                echo "Unknown argument: $1" >&2; usage; exit 2 ;;
    esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
container_name="natpuzzle-e2e"
image="${IMAGE_NAME}:${IMAGE_TAG}"

cyan() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }

# Prereq check — fail fast with a clear message rather than time-out silently.
# jq is used to parse /api/health (matching ci-cd.yml image-smoke-test). It is
# preinstalled on Ubuntu CI runners but not always on macOS / WSL; surface it
# explicitly so developers know what to install.
missing=()
for tool in docker curl jq; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        missing+=("$tool")
    fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
    red "ERROR: required tool(s) not found in PATH: ${missing[*]}"
    red "  Install hints:"
    red "    docker: https://docs.docker.com/get-docker/"
    red "    curl:   typically preinstalled; apt/brew install curl"
    red "    jq:     apt install jq | brew install jq | choco install jq"
    exit 1
fi

trap 'docker rm -f "$container_name" >/dev/null 2>&1 || true' EXIT INT TERM

cyan "Stopping any prior '$container_name' container"
docker rm -f "$container_name" >/dev/null 2>&1 || true

if [[ "$SKIP_BUILD" -eq 0 ]]; then
    cyan "Building Docker image: $image (context: $repo_root)"
    docker build -t "$image" "$repo_root"
else
    cyan "Skipping build (--skip-build); reusing existing image $image"
fi

cyan "Starting container: $container_name on port $PORT"
docker run -d --name "$container_name" -p "${PORT}:8080" \
    -e ASPNETCORE_ENVIRONMENT=Production \
    "$image" >/dev/null

cyan "Waiting for /api/health (timeout: ${HEALTH_TIMEOUT}s)"
healthy=0
for ((i = 1; i <= HEALTH_TIMEOUT; i++)); do
    if curl -fsS "http://localhost:${PORT}/api/health" -o health.json 2>/dev/null; then
        if jq -e '.status == "healthy" and .database == true and .questionCount > 0' health.json >/dev/null; then
            green "Health OK after ${i}s:"
            cat health.json
            echo
            healthy=1
            break
        fi
    fi
    if (( i % 5 == 0 )); then
        printf '\033[90m  Waiting... (%ds)\033[0m\n' "$i"
    fi
    sleep 1
done

if [[ "$healthy" -eq 0 ]]; then
    yellow "Health check failed after ${HEALTH_TIMEOUT}s. Container logs:"
    docker logs "$container_name" || true
    rm -f health.json
    exit 1
fi
rm -f health.json

cyan "Bootstrapping Playwright in tests/e2e"
cd "$repo_root/tests/e2e"

if [[ ! -d node_modules ]]; then
    echo "  Installing tests/e2e dependencies (npm ci)..."
    npm ci
else
    echo "  tests/e2e/node_modules present, skipping npm ci"
fi

echo "  Ensuring Chromium browser is installed..."
npx playwright install chromium

cyan "Running Playwright suite against http://localhost:${PORT}"
export PLAYWRIGHT_BASE_URL="http://localhost:${PORT}"

set +e
npx playwright test --reporter=list "${PLAYWRIGHT_ARGS[@]}"
playwright_exit=$?
set -e

if [[ "$playwright_exit" -ne 0 ]]; then
    yellow "Playwright failed (exit ${playwright_exit}). Last 200 lines of container logs:"
    docker logs --tail 200 "$container_name" || true
    exit "$playwright_exit"
fi

green ""
green "✅ Container E2E passed!"
exit 0
