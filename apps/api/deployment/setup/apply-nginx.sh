#!/bin/bash
set -eu

# Run with sudo after reviewing this script and nginx-api.conf.
if [ "$(id -u)" -ne 0 ]; then
    printf '%s\n' 'Run this script with sudo.' >&2
    exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
site=/etc/nginx/sites-available/default
snippet=/etc/nginx/snippets/nodexora-api.conf
backup=/etc/nginx/sites-available/default.nodexora-backup
include='include /etc/nginx/snippets/nodexora-api.conf;'

# Refuse to change an unexpected site or overwrite an existing backup/snippet.
test "$(readlink -f /etc/nginx/sites-enabled/default)" = "$site"
test ! -e "$backup"
test ! -e "$snippet"
test "$(grep -Ec '^[[:space:]]*server_name _;[[:space:]]*$' "$site")" = 1
if grep -Fq "$include" "$site"; then
    printf '%s\n' 'NodeXora include already exists; inspect the configuration first.' >&2
    exit 1
fi
/usr/sbin/nginx -t

candidate=$(mktemp /tmp/nodexora-nginx.XXXXXX)
trap 'rm -f -- "$candidate"' EXIT
awk -v include="$include" '
    { print }
    /^[[:space:]]*server_name _;[[:space:]]*$/ { print "\n    " include }
' "$site" > "$candidate"

cp -p -- "$site" "$backup"
install -m 644 "$script_dir/nginx-api.conf" "$snippet"
install -m 644 "$candidate" "$site"

if /usr/sbin/nginx -t && systemctl reload nginx; then
    printf 'Applied. Backup: %s\n' "$backup"
else
    cp -p -- "$backup" "$site"
    rm -f -- "$snippet"
    /usr/sbin/nginx -t && systemctl reload nginx
    printf '%s\n' 'Applying Nginx configuration failed; previous site restored.' >&2
    exit 1
fi

curl --fail --silent --show-error http://192.168.1.33/api/v1/health
printf '\n'
