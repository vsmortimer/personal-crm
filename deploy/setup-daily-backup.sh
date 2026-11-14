#!/usr/bin/env bash
# Sets up the nightly backup of prod's database: a systemd timer that runs
# `deploy.sh prod backup` as crmdeploy every day at 03:00 Moscow time. Run by a person, once:
#   scp deploy/* crm:crm-app-setup/
#   ssh -t crm sudo bash crm-app-setup/setup-daily-backup.sh
# Run it after the first Deploy prod that brought the `backup` command to /srv/prod/deploy.
# Safe to run again: it rewrites its own two unit files and nothing else, and takes one backup
# to prove that it works. The output of every run is in the journal: journalctl -u crm-backup
set -Eeuo pipefail

APP_DIR=/srv/prod
DEPLOY_USER=crmdeploy
UNIT_DIR=/etc/systemd/system
SERVICE=crm-backup.service
TIMER=crm-backup.timer
# The server's own clock may not be on Moscow time: the timer says it itself
SCHEDULE='*-*-* 03:00:00 Europe/Moscow'

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "run with sudo: sudo bash $0"
id "$DEPLOY_USER" >/dev/null 2>&1 || fail "user $DEPLOY_USER does not exist: run setup-server.sh first"
grep -q 'backup) lock; daily_backup' "$APP_DIR/deploy/deploy.sh" 2>/dev/null ||
    fail "$APP_DIR/deploy/deploy.sh has no backup command yet: run Deploy prod in GitHub Actions first, then this script"

step "Checking the schedule"
systemd-analyze calendar "$SCHEDULE"

step "Writing $UNIT_DIR/$SERVICE and $TIMER"
cat >"$UNIT_DIR/$SERVICE" <<UNIT
# Managed by setup-daily-backup.sh (personal-crm repo, deploy/): backup of prod's database
[Unit]
Description=Nightly backup of the prod database of the personal CRM

[Service]
Type=oneshot
User=$DEPLOY_USER
ExecStart=/usr/bin/bash $APP_DIR/deploy/deploy.sh prod backup
UNIT
cat >"$UNIT_DIR/$TIMER" <<UNIT
# Managed by setup-daily-backup.sh (personal-crm repo, deploy/)
[Unit]
Description=Nightly backup of the prod database of the personal CRM, 03:00 Moscow time

[Timer]
OnCalendar=$SCHEDULE
# The server was off at 03:00: take the backup as soon as it is on
Persistent=true

[Install]
WantedBy=timers.target
UNIT
chmod 644 "$UNIT_DIR/$SERVICE" "$UNIT_DIR/$TIMER"
systemd-analyze verify "$UNIT_DIR/$SERVICE" "$UNIT_DIR/$TIMER"
systemctl daemon-reload
systemctl enable --now "$TIMER"

step "Test run: one backup now"
systemctl start "$SERVICE" || {
    journalctl -u crm-backup --no-pager -n 30 -o cat
    fail "the test backup failed: the timer is set, but fix the cause above, then run this script again"
}
journalctl -u crm-backup --no-pager -n 12 -o cat
sudo -u "$DEPLOY_USER" bash "$APP_DIR/deploy/deploy.sh" prod status | sed -n '/^backups in/,$p'

step "Timer"
systemctl list-timers "$TIMER" --no-pager
echo
echo "ALL DONE $(date -Is)"
