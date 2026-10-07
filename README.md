# Nisaab360

A full-stack, multi-tenant school and learning-management application built with Next.js, React, TypeScript, PostgreSQL/Drizzle and Valkey. It includes institution, staff, student, parent and platform portals, public institution websites and admissions.

Start with the [single project context](.codex/CONTEXT.md) for the current architecture, source map, development commands, authorization boundaries, measured performance and remaining work. Contributors and coding agents should also read [AGENTS.md](AGENTS.md).

Use [.env.example](.env.example) for configuration names. The context explains the build/start wrappers and database prerequisites; `npm start` starts local dependencies and runs migrations. Never copy private environment values or access tokens into documentation.

Operational references:

- [Payment gateway setup](docs/payment-gateway-setup.md)
- [Institution backups](docs/institution-backups.md)
- [Load-test usage](k6/README.md)
- [Latest performance evidence](docs/performance-support-2026-10-02/performance-evidence.md)
- [Deployment guide](deploy_guide.md) (check against the current context and configuration)

Dated reports and raw test artifacts retain historical evidence. The project context is the maintained source for current project state.
