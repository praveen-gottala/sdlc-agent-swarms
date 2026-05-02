---
name: langfuse-password-reset
description: >-
  Reset the login password for a user in self-hosted Langfuse (Postgres `users.password`
  bcrypt column). Use when the user is locked out of the Langfuse UI, forgot their password,
  or asks for /langfuse-password-reset. Covers bcrypt generation, shell-safe SQL, and
  verification. Applies to the AgentForge stack at docker/docker-compose.langfuse.yml.
---

# Langfuse password reset (`/langfuse-password-reset`)

Self-hosted Langfuse stores UI credentials in Postgres: table **`users`**, column **`password`** (bcrypt string). There is **no** `password_hash` column.

## Prerequisites

- Langfuse stack running: `docker compose -f docker/docker-compose.langfuse.yml up -d`
- Docker CLI available
- User’s **email** exactly as stored (case-sensitive in SQL)

Default DB connection from [`docker/docker-compose.langfuse.yml`](../../../docker/docker-compose.langfuse.yml):

- Database: **`langfuse`**
- DB user: **`langfuse`** / **`langfuse`**
- Postgres service/container name varies by Compose project (often **`docker-postgres-1`** if the project directory is `docker`)

Resolve container name:

```bash
docker compose -f docker/docker-compose.langfuse.yml ps -q postgres | xargs docker inspect --format '{{.Name}}'
# or: docker ps --format '{{.Names}}' | grep -i postgres
```

Below, substitute **`CONTAINER`** for your Postgres container name.

## Step 1 — Generate a bcrypt hash

**Preferred:** helper script in this skill (uses **bcryptjs@2**, same family Langfuse expects):

```bash
bash .claude/skills/langfuse-password-reset/scripts/bcrypt-hash.sh 'YOUR_NEW_PASSWORD'
```

**One-liner** (temp dir + bcryptjs@2):

```bash
tmpdir=$(mktemp -d) && cd "$tmpdir" && npm init -y >/dev/null && npm install bcryptjs@2.4.3 --silent && node -e "const b=require('bcryptjs'); console.log(b.hashSync('YOUR_NEW_PASSWORD', 10))"
```

Copy the full line starting with `$2a$` (length **60**).

Avoid **`bcryptjs@3`** + bare **`require`** with **`npm exec`** unless you pin v2 or use ESM — resolution fails easily on some hosts.

## Step 2 — Write the hash into Postgres

**Do not** paste the hash inside double quotes in bash without escaping **`$`**. Bash will mangle `$2a`, `$10`, etc., and **`UPDATE 1`** will still store **wrong** data.

### Option A — Heredoc (recommended)

Use **`<<'SQL'`** so bash does **not** expand **`$`** inside the heredoc. Substitute **`CONTAINER`** and paste your full hash and email into the `UPDATE` line:

```bash
docker exec -i CONTAINER psql -U langfuse -d langfuse <<'SQL'
UPDATE users SET password = 'PASTE_FULL_BCRYPT_HASH_HERE' WHERE email = 'you@example.com';
SQL
```

Example (hash shortened):

```bash
docker exec -i docker-postgres-1 psql -U langfuse -d langfuse <<'SQL'
UPDATE users SET password = '$2a$10$......................................' WHERE email = 'you@example.com';
SQL
```

### Option B — Escaped dollars in `-c`

Escape **every** `$` in the hash as **`\$`** when the whole `-c` argument is in **double quotes**:

```bash
docker exec -it CONTAINER psql -U langfuse -d langfuse -c "UPDATE users SET password = '\$2a\$10\$......................................' WHERE email = 'you@example.com';"
```

## Step 3 — Verify

```bash
docker exec -it CONTAINER psql -U langfuse -d langfuse -c "SELECT length(password) AS len, left(password, 7) AS prefix FROM users WHERE email = 'you@example.com';"
```

Expect **`len = 60`** and **`prefix = $2a$10`** (or `$2b$` / `$2y$`).

## Step 4 — Sign in

Open **http://localhost:3001** (per compose port mapping) and log in with **email + new plaintext password**.

## Troubleshooting

| Symptom | Cause |
|--------|--------|
| `column "password_hash" does not exist` | Use column **`password`**, not `password_hash`. |
| Login fails after `UPDATE 1` | Hash was **corrupted by bash** (`$` expansion). Use heredoc (Option A) or `\$` escapes. |
| `Cannot find module 'bcryptjs'` | Use script or temp-dir install with **`bcryptjs@2.4.3`**, not uninstalled global `node -e`. |
| Wrong container | Use `docker compose ... ps` / `docker ps` to find the Langfuse **postgres** container. |

## Related docs

- [`docs/guides/langfuse-setup.md`](../../../docs/guides/langfuse-setup.md) — stack overview and ports
