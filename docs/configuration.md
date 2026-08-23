# Configuration / 配置

## Environment variables / 环境变量

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CREDENTIAL_KEY` | Yes | — | 64 hexadecimal characters used to encrypt stored credentials. |
| `GUACAMOLE_JSON_SECRET` | Yes | — | 32 hexadecimal characters shared with Guacamole JSON authentication. |
| `GUACAMOLE_UPSTREAM` | Yes | — | Internal Guacamole HTTP address, such as `http://guacamole:8080`. |
| `GUACD_ADDRESS` | Yes | — | Internal `guacd` address, such as `guacd:4822`. |
| `AUTH_PASSWORD` | No | empty | Global web password. Empty disables application login. |
| `SESSION_IDLE_TIMEOUT` | No | `24h` | Closes remote sessions with no user activity for this duration. |
| `GUACAMOLE_PUBLIC_PATH` | No | `/guacamole` | Same-origin path used to expose Guacamole through the application. |
| `GUACAMOLE_SESSION_TIMEOUT_MINUTES` | No | `1440` | Guacamole session timeout used by the Compose example. |

Generate secrets locally:

```bash
openssl rand -hex 32
openssl rand -hex 16
```

Use the 64-character output for `CREDENTIAL_KEY` and the 32-character output for `GUACAMOLE_JSON_SECRET`. Do not reuse either value as `AUTH_PASSWORD`.

使用 64 字符的输出作为 `CREDENTIAL_KEY`，使用 32 字符的输出作为 `GUACAMOLE_JSON_SECRET`，不要把它们复用为登录密码。

## Persistent data / 持久数据

Mount `/app/data` on persistent storage. It contains the SQLite database. Keep `CREDENTIAL_KEY` unchanged after assets have been saved, otherwise existing encrypted credentials cannot be decrypted.

请将 `/app/data` 挂载到持久存储。资产保存后不要更换 `CREDENTIAL_KEY`，否则已有加密凭据将无法解密。

## Client behavior / 客户端行为

- Language, theme, sidebar state, open tabs, and custom key combinations are stored in browser local storage.
- The soft-keyboard button is shown only on touch phones and tablets.
- The key-combination button is available on both touch and desktop devices; its list opens only after the button is clicked.
- The PWA checks for updates when opened, when returning to the foreground, and every 15 minutes. A new version activates and reloads automatically.
- On iOS/iPadOS, the application paints a solid safe-area layer behind the native status bar so translucent system rendering cannot blur page content. Remove and reinstall an existing PWA after this metadata changes.

- 语言、主题、侧边栏状态、已打开 Tab 和自定义快捷键保存在浏览器本地存储中。
- 软键盘按钮只在触屏手机和平板上显示。
- 发送按键按钮在移动端和桌面端均可用，点击按钮后才展开快捷键列表。
- PWA 会在启动、回到前台以及每 15 分钟自动检查更新；发现新版本后自动激活并刷新。
- iOS/iPadOS 由应用在原生状态栏下方绘制纯色安全区，避免系统透明合成模糊页面内容；状态栏元数据变化后，请移除并重新安装已有 PWA。
