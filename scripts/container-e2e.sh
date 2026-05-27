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
    # Helper: fail fast with a clear message when a flag is missing its value.
    # Without this, `set -u` turns a missing `$2` into "unbound variable" which
    # is opaque to the caller — surface the actual problem (which flag) instead.
    require_arg() {
        if [[ $# -lt 2 || -z "${2:-}" || "${2:-}" == -* ]]; then
            echo "Missing value for $1" >&2
            usage
            exit 2
        fi
    }
    case "$1" in
        --image-name)     require_arg "$@"; IMAGE_NAME="$2"; shift 2 ;;
        --image-tag)      require_arg "$@"; IMAGE_TAG="$2"; shift 2 ;;
        --port)           require_arg "$@"; PORT="$2"; shift 2 ;;
        --health-timeout) require_arg "$@"; HEALTH_TIMEOUT="$2"; shift 2 ;;
        --skip-build)     SKIP_BUILD=1; shift ;;
        -h|--help)        usage; exit 0 ;;
        --)               shift; PLAYWRIGHT_ARGS=("$@"); break ;;
        *)                echo "Unknown argument: $1" >&2; usage; exit 2 ;;
    esac
done

# Numeric validation for flags consumed in arithmetic contexts further down
# (`for ((i = 1; i <= HEALTH_TIMEOUT; i++))`, `(( i % 5 == 0 ))`) and for the
# Docker `-p` port mapping. Without this, a typo like `--port 8O8O` (letter O)
# surfaces as an opaque bash arithmetic-syntax error mid-run; fail fast with a
# clear message instead.
require_positive_int() {
    local flag="$1" value="$2"
    # Regex check first ensures `value` is digits-only. Then force base-10
    # interpretation with `10#` so leading-zero inputs like `008` don't trip
    # bash's octal parser (which would otherwise emit "value too great for
    # base" for any digit ≥ 8 and skip past this check).
    if ! [[ "$value" =~ ^[0-9]+$ ]] || (( 10#$value <= 0 )); then
        echo "Invalid value for $flag: '$value' (expected positive integer)" >&2
        usage
        exit 2
    fi
}
require_positive_int --port "$PORT"
require_positive_int --health-timeout "$HEALTH_TIMEOUT"
if (( 10#$PORT > 65535 )); then
    echo "Invalid value for --port: '$PORT' (must be 1-65535)" >&2
    usage
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
container_name="natpuzzle-e2e"
image="${IMAGE_NAME}:${IMAGE_TAG}"

cyan() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }

# Prereq check — fail fast with a clear message rather than time-out silently
# or fail mid-script with a confusing error.
#   docker / curl / jq: container build + run + health gate (jq matches ci-cd.yml
#     image-smoke-test parsing).
#   node / npm / npx:   Playwright bootstrap and test execution.
# jq is preinstalled on Ubuntu CI runners but not always on macOS / WSL; surface
# it explicitly so developers know what to install.
missing=()
for tool in docker curl jq node npm npx; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        missing+=("$tool")
    fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
    red "ERROR: required tool(s) not found in PATH: ${missing[*]}"
    red "  Install hints:"
    red "    docker:        https://docs.docker.com/get-docker/"
    red "    curl:          typically preinstalled; apt/brew install curl"
    red "    jq:            apt install jq, or brew install jq, or choco install jq"
    red "    node/npm/npx:  install Node.js 22+ from https://nodejs.org/ (bundles npm/npx)"
    exit 1
fi

# Temp file for /api/health response — created upfront so the trap can clean it
# up even if the script is interrupted before the health loop completes.
#
# `mktemp` with no template works on GNU coreutils (Linux) but BSD mktemp
# (macOS) requires a template; the `||` fallback uses `-t` for portability.
health_file="$(mktemp 2>/dev/null || mktemp -t natpuzzle-health.XXXXXX)"

# Cleanup runs once on EXIT. Signal handlers re-raise as explicit exits so the
# cleanup happens via EXIT (single source of truth) AND the script actually
# aborts instead of resuming the interrupted command (e.g., the health-loop
# `sleep` would otherwise be resumed after cleanup and run against a removed
# container).
cleanup() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    rm -f "$health_file"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
    if curl -fsS "http://localhost:${PORT}/api/health" -o "$health_file" 2>/dev/null; then
        if jq -e '.status == "healthy" and .database == true and .questionCount > 0' "$health_file" >/dev/null; then
            green "Health OK after ${i}s:"
            cat "$health_file"
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
    exit 1
fi

cyan "Bootstrapping Playwright in tests/e2e"
cd "$repo_root/tests/e2e"

# Always run `npm ci` for a reproducible install matching package-lock.json.
# Skipping when node_modules exists can mask stale-deps regressions, which
# defeats the point of a pre-push reproducer.
echo "  Installing tests/e2e dependencies (npm ci)..."
npm ci

echo "  Ensuring Chromium browser is installed..."
# On Linux, install Chromium's system dependencies too (matches CI's
# `playwright install --with-deps chromium` invocation in ci-cd.yml so local
# reproducer results match CI). macOS doesn't expose --with-deps the same way
# (Playwright skips system deps on Darwin); plain install is correct there.
if [[ "$(uname -s)" == "Linux" ]]; then
    npx playwright install --with-deps chromium
else
    npx playwright install chromium
fi

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
