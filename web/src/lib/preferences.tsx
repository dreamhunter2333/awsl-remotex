import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

const messages = {
  "zh-CN": {
    language: "语言",
    theme: "主题",
    followSystem: "跟随系统",
    dark: "深色",
    light: "浅色",
    filterConnections: "筛选连接…",
    doubleClickConnect: "双击连接",
    expandSidebar: "展开侧边栏",
    collapseSidebar: "收起侧边栏",
    loadingAssets: "正在读取资产…",
    noAssets: "暂无资产",
    addAsset: "添加资产",
    closeSession: "关闭 {name}",
    remoteSession: "{name} 远程会话",
    reconnect: "重新连接",
    fullscreen: "全屏",
    exitFullscreen: "退出全屏",
    keyboard: "键盘",
    shortcuts: "发送按键",
    customShortcut: "自定义快捷键",
    shortcutPlaceholder: "例如 Ctrl+Shift+T",
    addShortcut: "添加快捷键",
    deleteShortcut: "删除快捷键 {name}",
    invalidShortcut: "快捷键格式无效",
    shortcutExists: "这个快捷键已存在",
    shortcutLimit: "最多保存 12 个快捷键",
    disconnect: "断开连接",
    sessionActions: "会话操作",
    connectionFailed: "连接失败",
    sessionEnded: "连接已断开，请重新连接",
    guacamoleSdkError: "远程客户端加载失败，请刷新后重试",
    guacamoleAuthenticationError: "远程主机认证失败，请检查凭据",
    guacamoleForbiddenError: "没有权限访问此远程连接",
    guacamoleDnsError: "无法解析或找到远程主机",
    guacamoleCertificateError: "远程主机证书校验失败",
    guacamoleSecurityError: "远程主机安全协议不兼容",
    guacamoleTimeoutError: "连接远程主机超时",
    guacamoleBusyError: "远程服务繁忙，请稍后重试",
    guacamoleConflictError: "远程会话冲突或已被占用",
    guacamoleUpstreamError: "远程网关或目标主机不可用",
    idleSessionClosed: "“{name}”长时间未使用，已自动断开",
    addAssetFailed: "添加资产失败",
    addRemoteAsset: "添加远程资产",
    close: "关闭",
    name: "名称",
    group: "分组",
    groupPlaceholder: "生产环境",
    protocol: "协议",
    host: "主机",
    port: "端口",
    username: "用户名",
    cancel: "取消",
    adding: "正在添加…",
    defaultGroup: "默认分组",
    checkingAuthentication: "正在检查认证…",
    password: "密码",
    passwordPlaceholder: "输入密码",
    signIn: "登录",
    signingIn: "正在登录…",
    signInDescription: "使用环境变量中配置的账号和密码登录。",
    invalidPassword: "账号或密码错误",
    logout: "退出登录",
    testConnection: "测试连接",
    testingConnection: "正在测试…",
    connectionReachable: "连接成功，耗时 {latency} ms",
    connectionUnreachable: "连接失败：{message}",
    editAsset: "编辑资产",
    saveChanges: "保存修改",
    saving: "正在保存…",
    deleteAsset: "删除连接",
    confirmDelete: "确定删除连接“{name}”吗？此操作无法撤销。",
    authentication: "认证方式",
    noSavedCredential: "不保存凭据",
    passwordCredential: "保存密码",
    connectionPassword: "连接密码",
    privateKeyCredential: "SSH 私钥",
    passwordHint: "留空则保留现有密码",
    privateKey: "私钥",
    privateKeyPlaceholder: "粘贴 OpenSSH 私钥",
    privateKeyHint: "粘贴 OpenSSH 私钥；留空则保留现有私钥",
    passphrase: "私钥口令",
    advancedSettings: "高级设置",
    customVNCSettings: "使用自定义 VNC 参数",
    customVNCSettingsHint: "仅在目标服务需要指定编码时启用",
    vncEncoding: "编码",
    colorDepth: "色深",
    colorDepthBits: "{depth} 位",
    protocolDefault: "协议默认值",
  },
  en: {
    language: "Language",
    theme: "Theme",
    followSystem: "System",
    dark: "Dark",
    light: "Light",
    filterConnections: "Filter connections…",
    doubleClickConnect: "Double-click to connect",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    loadingAssets: "Loading assets…",
    noAssets: "No assets yet",
    addAsset: "Add asset",
    closeSession: "Close {name}",
    remoteSession: "{name} remote session",
    reconnect: "Reconnect",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    keyboard: "Keyboard",
    shortcuts: "Send keys",
    customShortcut: "Custom shortcut",
    shortcutPlaceholder: "e.g. Ctrl+Shift+T",
    addShortcut: "Add shortcut",
    deleteShortcut: "Delete shortcut {name}",
    invalidShortcut: "Invalid shortcut",
    shortcutExists: "Shortcut already exists",
    shortcutLimit: "Up to 12 shortcuts",
    disconnect: "Disconnect",
    sessionActions: "Session actions",
    connectionFailed: "Connection failed",
    sessionEnded: "Connection ended. Reconnect to continue",
    guacamoleSdkError: "The remote client failed to load. Refresh and try again",
    guacamoleAuthenticationError: "Remote authentication failed. Check the credentials",
    guacamoleForbiddenError: "You do not have permission to access this connection",
    guacamoleDnsError: "The remote host could not be resolved or found",
    guacamoleCertificateError: "The remote host certificate could not be verified",
    guacamoleSecurityError: "The remote security protocol is incompatible",
    guacamoleTimeoutError: "The remote connection timed out",
    guacamoleBusyError: "The remote service is busy. Try again later",
    guacamoleConflictError: "The remote session conflicts with another session",
    guacamoleUpstreamError: "The remote gateway or host is unavailable",
    idleSessionClosed: "“{name}” was disconnected after being idle",
    addAssetFailed: "Failed to add asset",
    addRemoteAsset: "Add remote asset",
    close: "Close",
    name: "Name",
    group: "Group",
    groupPlaceholder: "Production",
    protocol: "Protocol",
    host: "Host",
    port: "Port",
    username: "Username",
    cancel: "Cancel",
    adding: "Adding…",
    defaultGroup: "Default",
    checkingAuthentication: "Checking authentication…",
    password: "Password",
    passwordPlaceholder: "Enter password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signInDescription: "Sign in with the username and password configured through the environment.",
    invalidPassword: "Incorrect username or password",
    logout: "Sign out",
    testConnection: "Test connection",
    testingConnection: "Testing…",
    connectionReachable: "Connected in {latency} ms",
    connectionUnreachable: "Connection failed: {message}",
    editAsset: "Edit asset",
    saveChanges: "Save changes",
    saving: "Saving…",
    deleteAsset: "Delete connection",
    confirmDelete: "Delete connection “{name}”? This cannot be undone.",
    authentication: "Authentication",
    noSavedCredential: "Do not save",
    passwordCredential: "Saved password",
    connectionPassword: "Connection password",
    privateKeyCredential: "SSH private key",
    passwordHint: "Leave blank to keep the saved password",
    privateKey: "Private key",
    privateKeyPlaceholder: "Paste an OpenSSH private key",
    privateKeyHint: "Paste an OpenSSH private key; leave blank to keep the saved key",
    passphrase: "Key passphrase",
    advancedSettings: "Advanced settings",
    customVNCSettings: "Use custom VNC parameters",
    customVNCSettingsHint: "Enable only when the server requires a specific encoding",
    vncEncoding: "Encoding",
    colorDepth: "Color depth",
    colorDepthBits: "{depth}-bit",
    protocolDefault: "Protocol default",
  },
} as const

export type Locale = keyof typeof messages
export type ThemeMode = "system" | "dark" | "light"
type MessageKey = keyof (typeof messages)["zh-CN"]
type Values = Record<string, string | number>

interface PreferencesContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  t: (key: MessageKey, values?: Values) => string
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = localStorage.getItem("awsl-remotex.locale")
    if (stored === "zh-CN" || stored === "en") return stored
    return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
  })
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("awsl-remotex.theme")
    if (stored === "dark" || stored === "light" || stored === "system") return stored
    return "system"
  })

  useEffect(() => {
    localStorage.setItem("awsl-remotex.locale", locale)
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const applyTheme = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme
      document.documentElement.dataset.theme = resolved
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#282c34" : "#fafafa")
    }
    localStorage.setItem("awsl-remotex.theme", theme)
    applyTheme()
    media.addEventListener("change", applyTheme)
    return () => media.removeEventListener("change", applyTheme)
  }, [theme])

  const value = useMemo<PreferencesContextValue>(() => ({
    locale,
    setLocale,
    theme,
    setTheme,
    t: (key, values) => {
      let message: string = messages[locale][key]
      for (const [name, replacement] of Object.entries(values ?? {})) {
        message = message.replaceAll(`{${name}}`, String(replacement))
      }
      return message
    },
  }), [locale, theme])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error("usePreferences must be used within PreferencesProvider")
  return value
}
