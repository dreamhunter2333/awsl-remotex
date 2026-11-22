FROM debian:bookworm-slim

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends dbus-x11 iproute2 netcat-openbsd openssh-server python3 x11vnc xauth xclip xorgxrdp xrdp xterm xvfb \
    && useradd -m -s /bin/bash fixture \
    && echo 'fixture:fixture-password' | chpasswd \
    && adduser xrdp ssl-cert \
    && rm -rf /var/lib/apt/lists/*

COPY start.sh /usr/local/bin/start-desktop
COPY fixture.py /usr/local/bin/fixture.py
RUN chmod +x /usr/local/bin/start-desktop
ENTRYPOINT ["/usr/local/bin/start-desktop"]
