# 0017: Always Run `native:migrate` After Adding or Changing a Migration

## Status

Accepted

## Context

LaraKube Desktop stores its local state (projects, runs, groups, etc.) in the NativePHP SQLite database at `desktop/database/nativephp.sqlite`, on the `nativephp` connection.

The Pest suite runs against its own in-memory/test database and runs migrations automatically (`RefreshDatabase`). So a new migration can be written, the feature built on top of it, and **every test, PHPStan and TypeScript check passes — while the running app is still on the old schema.**

This has happened more than once. Most recently, the project-groups feature added `2026_10_21_000001_add_group_to_projects_table.php`; the tests were green, but assigning a group in the app failed with:

```
SQLSTATE[HY000]: General error: 1 no such column: group
(Connection: nativephp, Database: desktop/database/nativephp.sqlite)
```

The user then had to report it, wait for the fix, and rebuild — wasted time and tokens on something a single command prevents.

Plain `php artisan migrate` is not a substitute: it targets the default connection, not the NativePHP database the desktop app actually reads.

## Decision

1. **Any change that adds or edits a file in `desktop/database/migrations/` MUST be followed, in the same task, by:**

    ```bash
    cd desktop && php artisan native:migrate --force
    ```

2. **It is part of the verification checklist**, alongside `types:check`, `pint`, `phpstan` and `pest`. A task that ships a migration is not done until `native:migrate` has run and reported the migration as `DONE`.

3. **Report it.** When summarising work that includes a migration, state that `native:migrate` was run and which migration(s) it applied.

4. Migrations themselves stay additive and idempotent-safe (`Schema::hasColumn` guards where reasonable) so re-running `native:migrate` is always harmless.

## Consequences

- The running desktop app's schema always matches the code, so features work on first try after `./build`.
- Green tests are no longer mistaken for "the app works" when the schema changed.
- One extra command per migration-bearing task; negligible cost compared to a failed manual test round-trip.
