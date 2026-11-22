#!/bin/sh
set -eu

mkdir -p /run/sshd /run/xrdp
ssh-keygen -A
x11vnc -storepasswd fixture /run/vnc-password
/usr/sbin/sshd -D -e -o PasswordAuthentication=yes &
/usr/sbin/xrdp-sesman --nodaemon &
/usr/sbin/xrdp --nodaemon &
tail -F /var/log/xrdp.log /var/log/xrdp-sesman.log &
Xvfb :99 -screen 0 1280x900x24 -ac &
until nc -zU /tmp/.X11-unix/X99; do sleep 0.1; done
runuser -u fixture -- env DISPLAY=:99 xterm -title "RemoteX VNC fixture" &
python3 /usr/local/bin/fixture.py &
export X11VNC_AVOID_WINDOWS=never
exec x11vnc -display :99 -rfbauth /run/vnc-password -forever -shared -noxdamage -noprimary -nosetprimary
