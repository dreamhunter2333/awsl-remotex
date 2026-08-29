# Security policy

## Supported versions

Security fixes are applied to the latest released version. Upgrade to the newest stable container tag before reporting an issue that may already be fixed.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities or include credentials, private keys, connection tickets, cookies, internal addresses, or database contents in public reports.

Use the repository's private [GitHub security advisory form](https://github.com/dreamhunter2333/awsl-remotex/security/advisories/new). Include the affected version, deployment model, impact, and minimal reproduction steps with all secrets removed.

## Deployment expectations

- Set a strong `AUTH_PASSWORD`; leaving it empty disables application authentication.
- Use HTTPS outside an intentionally trusted network.
- Keep `.env`, `CREDENTIAL_KEY`, backups, and the SQLite data directory secret.
- Restrict network access to Guacamole and `guacd`; expose only the Awsl RemoteX HTTP service through the reverse proxy.
- Preserve the original `CREDENTIAL_KEY` for recovery, but rotate other compromised credentials immediately.

## 中文

安全修复仅面向最新版本。疑似漏洞请通过仓库的 GitHub 私有安全公告入口报告，不要在公开 Issue 中提交密码、私钥、票据、Cookie、内网地址或数据库内容。

生产环境应设置高强度 `AUTH_PASSWORD`、启用 HTTPS、妥善保护 `.env`、`CREDENTIAL_KEY`、备份和 SQLite 数据目录，并只通过 Awsl RemoteX 暴露 Guacamole 流量。
