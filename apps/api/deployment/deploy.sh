#!/usr/bin/env bash
set -Eeuo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Internal server-side step. The public entry point is at the bottom of this file.
activate_release() (
    [[ $(uname -s) == Linux ]] || die 'Activation requires Linux.'
    [[ $(id -u) != 0 ]] || die 'Deploy as the ordinary API user, not root.'
    export PATH="$HOME/.local/bin:$PATH"
    base=$(realpath -e "$HOME/nodexora")
    [[ $base == "$(realpath -e "$HOME")/nodexora" ]] || die 'Unexpected deployment base.'
    [[ $# == 2 && $2 =~ ^[0-9]+$ ]] || die 'Expected staging path and build Node.js major.'
    stage=$(realpath -e "$1")
    build_node_major=$2
    [[ $stage == "$base"/.deploy.* && ! -L $stage ]] || die 'Unexpected staging directory.'
    target="$base/api"
    backup="$stage.previous"
    [[ $(realpath -e "$target") == "$target" && ! -L $target ]] || die 'Existing API directory required.'
    [[ ! -e $backup ]] || die 'Backup path already exists.'
    for tool in node npm curl flock ss systemctl loginctl; do command -v "$tool" >/dev/null || die "Missing server tool: $tool"; done

    # Serialize updates, including dependency installation and release switching.
    exec 9> "$base/.deploy.lock"
    flock -n 9 || die 'Another deployment is running.'
    export SYSTEM_PROVIDER=linux PORT=3000
    unit=nodexora-api.service
    [[ $(systemctl --user show "$unit" -p LoadState --value) == loaded ]] || die 'Install the NodeXora user service first.'
    [[ $(systemctl --user show "$unit" -p WorkingDirectory --value) == "$target" ]] || die 'Unexpected service working directory.'
    systemctl --user is-enabled --quiet "$unit" || die 'Enable the user service before deploying.'
    [[ $(loginctl show-user "$(id -un)" -p Linger --value) == yes ]] || die 'User lingering is required for startup at boot.'

    cd -- "$stage"
    node -e '
      if (Number(process.argv[1]) !== Number(process.versions.node.split(".")[0])) {
        throw new Error("Local build and server Node.js major versions differ");
      }
    ' "$build_node_major"
    npm ci --omit=dev --ignore-scripts

    # Test the shipped JavaScript with Linux data before stopping the running API.
    node --input-type=module <<'SMOKE'
import assert from 'node:assert/strict';
import { buildApp } from './dist/app.js';
import { readConfig } from './dist/config/env.js';
import { LinuxSystemProvider } from './dist/infrastructure/linux/system.provider.js';
readConfig();
const app = await buildApp({ provider: new LinuxSystemProvider(), logger: false });
try {
  assert.equal((await app.inject('/api/v1/health')).statusCode, 200);
  assert.equal((await app.inject('/api/')).statusCode, 200);
  assert.equal((await app.inject('/api/json')).statusCode, 200);
  const response = await app.inject('/api/v1/system/memory');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.source, 'linux');
} finally {
  await app.close();
}
SMOKE

    start_api() {
        systemctl --user start "$unit"
    }
    wait_ready() {
        for ((attempt=0; attempt<30; attempt++)); do
            if systemctl --user is-active --quiet "$unit" &&
                curl --fail --silent --max-time 2 --output /dev/null http://127.0.0.1:3000/api/v1/health; then
                return 0
            fi
            sleep 0.2
        done
        return 1
    }

    # Do not stop an unrelated listener if the configured service is inactive.
    if ! systemctl --user is-active --quiet "$unit" && [[ -n $(ss -H -ltn 'sport = :3000') ]]; then
        die 'Port 3000 is occupied outside the NodeXora service; nothing stopped.'
    fi

    old_stopped=0 old_moved=0 new_moved=0 success=0
    on_exit() {
        result=$?
        trap - EXIT INT TERM HUP
        if [[ $success == 0 && $old_stopped == 1 ]]; then
            printf '%s\n' 'Update failed; restoring the previous API.' >&2
            if ! systemctl --user stop "$unit"; then
                printf 'Cannot stop service safely. Previous files preserved at %s\n' "$backup" >&2
                exit 1
            fi
            cd -- "$base"
            if [[ $new_moved == 1 ]]; then mv -- "$target" "$stage" || exit 1; fi
            if [[ $old_moved == 1 ]]; then mv -- "$backup" "$target" || exit 1; fi
            if start_api && wait_ready; then
                printf '%s\n' 'Previous API restored under systemd.' >&2
            else
                printf 'Previous files restored, but API is not healthy. Inspect journalctl --user -u %s\n' "$unit" >&2
            fi
        fi
        if [[ $result != 0 ]]; then printf 'Failed release retained for inspection: %s\n' "$stage" >&2; fi
        exit "$result"
    }
    trap on_exit EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    trap 'exit 129' HUP

    old_stopped=1
    systemctl --user stop "$unit" || die 'Cannot stop the current API service.'
    cd -- "$base"
    mv -- "$target" "$backup"
    old_moved=1
    mv -- "$stage" "$target"
    new_moved=1
    start_api
    wait_ready || die 'New API did not become ready.'

    for route in /api/ /api/json /api/static/swagger-ui.css; do
        curl --fail --silent --show-error --max-time 10 --output /dev/null "http://127.0.0.1$route"
    done
    curl --fail --silent --show-error --max-time 10 --output /dev/null \
        http://127.0.0.1/api/v1/system/memory

    # These exact paths were validated above; never delete an arbitrary caller path.
    [[ $(realpath -e "$backup") == "$backup" && ! -L $backup ]] || die 'Unexpected backup path.'
    cd -- "$base"
    success=1
    rm -rf -- "$backup"
    printf 'Deployment complete: %s (systemd user service %s). Nginx unchanged.\n' "$target" "$unit"
)

if [[ ${1:-} == --activate ]]; then
    activate_release "${2:-}" "${3:-}"
    exit
fi
if [[ ${1:-} == --help ]]; then
    printf '%s\n' \
        'Usage: bash deployment/deploy.sh' \
        'Run locally using Git Bash on Windows, or Bash on Linux.' \
        'Optional: DEPLOY_HOST=user@host SSH_KEY=/path/to/key bash deployment/deploy.sh' \
        'Defaults: dvor@192.168.1.33 and ~/.ssh/id_ed25519_hermes_server.' \
        'Builds/tests locally, ships dist, installs Linux production dependencies, restarts and checks API.' \
        'Requires ~/nodexora/api, enabled nodexora-api user service with linger, and Nginx /api/ route.'
    exit
fi
[[ $# == 0 ]] || die 'Unknown argument; use --help.'

api_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
deploy_host=${DEPLOY_HOST:-dvor@192.168.1.33}
ssh_key=${SSH_KEY:-$HOME/.ssh/id_ed25519_hermes_server}
[[ $deploy_host =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*@[a-zA-Z0-9_][a-zA-Z0-9_.-]*$ ]] || die 'Expected DEPLOY_HOST=user@hostname (or IPv4).'
[[ -f $ssh_key ]] || die "SSH key not found: $ssh_key"
for tool in node npm ssh scp tar; do command -v "$tool" >/dev/null || die "Missing local tool: $tool"; done

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/nodexora-deploy.XXXXXX")
# Normalize Git Bash's /tmp mapping before comparing paths during cleanup.
work_dir=$(cd -- "$work_dir" && pwd -P)
readonly work_dir
cleanup_local() {
    # Only remove the exact temporary directory created by this invocation.
    if [[ -d $work_dir && ! -L $work_dir && $(cd -- "$work_dir" && pwd -P) == "$work_dir" ]]; then
        rm -rf -- "$work_dir"
    fi
}
trap cleanup_local EXIT

cd -- "$api_dir"
printf '%s\n' '1/4 Install, type-check, test and build locally.'
npm ci --ignore-scripts
npm run check
npm test
# A fresh temporary output avoids shipping stale files from a previous dist build.
npm run build -- --outDir "$work_dir/dist"
build_node_major=$(node -p 'process.versions.node.split(".")[0]')
tar -czf "$work_dir/release.tgz" -C "$work_dir" dist \
    -C "$api_dir" package.json package-lock.json

ssh_options=(-i "$ssh_key" -o IdentitiesOnly=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
printf '2/4 Create staging directory on %s.\n' "$deploy_host"
remote_stage=$(ssh "${ssh_options[@]}" "$deploy_host" \
    'set -eu; test -d "$HOME/nodexora/api"; test ! -L "$HOME/nodexora"; mktemp -d "$HOME/nodexora/.deploy.XXXXXX"')
[[ $remote_stage =~ ^/[a-zA-Z0-9_./-]+/nodexora/\.deploy\.[a-zA-Z0-9]+$ ]] || die 'Unexpected remote staging path.'
printf '%s\n' '3/4 Copy compiled JavaScript and package manifests (not Windows node_modules or secrets).'
scp "${ssh_options[@]}" "$work_dir/release.tgz" "$deploy_host:$remote_stage/release.tgz"
printf -v remote_command 'tar -xzf %q -C %q && rm -f -- %q && tr -d %q | bash -s -- --activate %q %q' \
    "$remote_stage/release.tgz" "$remote_stage" "$remote_stage/release.tgz" $'\r' "$remote_stage" "$build_node_major"
printf '%s\n' '4/4 Verify Linux release, restart API and check Nginx; roll back if activation fails.'
# Execute the activation instructions through stdin; do not install the script in the release.
ssh "${ssh_options[@]}" "$deploy_host" "$remote_command" < "$api_dir/deployment/deploy.sh"
printf 'Swagger: http://%s/api/\n' "${deploy_host#*@}"
