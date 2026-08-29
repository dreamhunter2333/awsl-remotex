# Changelog

All notable user-facing changes are recorded here. Versions follow the repository's `vMAJOR.MINOR.PATCH` tags.

## v0.2.17 - 2026-08-29

- Added per-asset VNC server-rendered cursor and wheel-direction settings.
- Kept existing cursor and scrolling behavior unchanged for assets without overrides.

## v0.2.16 - 2026-08-29

- Added optional per-asset VNC encoding and color-depth settings for servers requiring Tight JPEG.
- Kept Guacamole VNC defaults unchanged unless the override is explicitly enabled.

## v0.2.15 - 2026-08-29

- Documentation synchronized with the direct Guacamole SDK architecture and current operations.
- Suspended remote keyboard capture while a modal dialog is open so form input remains local.

## v0.2.14 - 2026-08-28

- Prevented duplicate local and remote mouse cursors by using the remote hardware cursor when supported and a software fallback otherwise.

## v0.2.13 - 2026-08-28

- Routed page-level keyboard input to the active remote session.
- Preserved key ownership across tab switches to avoid stuck modifiers.

## v0.2.12 - 2026-08-28

- Replaced the embedded Guacamole web application iframe with the official Guacamole 1.6.0 SDK, direct Canvas rendering, and a WebSocket tunnel.
- Added direct clipboard, keyboard, mouse, resize, and detailed connection failure handling.

## v0.2.11 - 2026-08-25

- Avoided remote-display resize races during session setup.

## v0.2.10 - 2026-08-25

- Improved remote-session resize reliability.

## v0.2.9 - 2026-08-24

- Added the workspace preview and refined login setup documentation.
