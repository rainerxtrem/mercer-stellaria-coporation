# Repository guidelines

This application is deployed as a Docker container on Railway, backed by a
PostgreSQL service. See the "Exploitation technique" section of README.md for
the architecture, the migration workflow and the required environment variables.

- Database changes go through a new file in `db/migrations`; never edit an
  applied migration (the runner verifies checksums).
- Secrets live in environment variables only. `.env` is git-ignored; document new
  variables in `.env.example`.
- Authorization is enforced by PostgreSQL row-level security, not in application
  code. Server code selects the role through the request context.
