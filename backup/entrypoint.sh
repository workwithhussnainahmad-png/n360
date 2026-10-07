#!/bin/sh
set -eu

schedule="${SCHEDULE:-0 0 * * *}"
printf '%s %s\n' "${schedule}" '/backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2' > /etc/crontabs/root

if [ "${BACKUP_ON_STARTUP:-true}" = "true" ]; then
  if ! /backup.sh; then
    echo "Initial backup failed; the scheduled job will retry at ${schedule}." >&2
  fi
fi

exec crond -f -d 8
