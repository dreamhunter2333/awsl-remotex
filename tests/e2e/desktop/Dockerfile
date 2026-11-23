FROM debian:bookworm-slim

RUN printf '%s\n' 'deb http://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/backports.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends dbus-x11 iproute2 netcat-openbsd openssh-server python3 x11vnc xauth xclip xorgxrdp xrdp xterm xvfb \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends -t bookworm-backports pipewire pipewire-bin pipewire-module-xrdp wireplumber \
    && useradd -m -s /bin/bash fixture \
    && echo 'fixture:fixture-password' | chpasswd \
    && adduser xrdp ssl-cert \
    && rm -rf /var/lib/apt/lists/*

COPY start.sh /usr/local/bin/start-desktop
COPY rdp-session.sh /etc/xrdp/startwm.sh
COPY fixture.py /usr/local/bin/fixture.py
RUN chmod +x /usr/local/bin/start-desktop
ENTRYPOINT ["/usr/local/bin/start-desktop"]
