# Security and privacy

Portfolio OS is designed to keep credentials and portfolio data outside Git.

## Never commit

- `.env` files, API keys, session secrets, database passwords, or provider credentials.
- Postgres dumps, SQLite files, exported portfolio backups, spreadsheets, or generated research packets.
- Screenshots containing real names, email addresses, balances, account numbers, or portfolio allocations.

The repository's `.gitignore` and `.dockerignore` cover the common cases, but contributors should still review `git diff --cached` before every push.

## Local data boundaries

- User accounts, holdings, transactions, snapshots, and family safety records live in Postgres.
- AI and market-data credentials are read from environment variables.
- `examples/demo-portfolio.json` and repository screenshots contain fictional data only.
- Portfolio exports are complete financial records. Store them as private backups and do not attach them to public issues.

## Before a public deployment

1. Replace `SESSION_SECRET`, `POSTGRES_PASSWORD`, and every enabled provider key.
2. Restrict network access to Postgres and do not expose port `5432` publicly.
3. Use HTTPS and set `APP_ORIGIN` to the exact public frontend origin.
4. Review CORS, backup retention, database access, and invite-code administration.

## Reporting a vulnerability

Please open a GitHub security advisory instead of posting credentials or private portfolio data in a public issue.
