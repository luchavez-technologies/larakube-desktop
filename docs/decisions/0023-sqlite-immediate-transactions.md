# 0023. SQLite transactions are IMMEDIATE

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Desktop's database is one SQLite file written by several processes at once: the
web workers serving pages, two queue workers (`default` and `sync`), the
scheduler, and NativePHP's own requests. WAL lets readers and one writer overlap,
and a busy timeout makes a second writer wait instead of failing.

Neither helps a transaction that starts as a read and later writes. Laravel's
database queue claims a job exactly that way: it selects the next job, then marks
it reserved, inside one transaction. Under SQLite's default DEFERRED mode, if
another process writes between those two steps, the upgrade from read lock to
write lock fails at once with `database is locked`. The busy timeout does not
apply to that upgrade. With sync jobs on a short schedule, this produced a steady
stream of failed jobs.

## Decision

1. Every SQLite connection uses `transaction_mode = IMMEDIATE`: a transaction
   takes the write lock at `BEGIN`, where the busy timeout applies, so a second
   writer waits its turn instead of failing.
2. This holds for both connections: `sqlite` in `config/database.php` and the
   `nativephp` connection NativePHP creates at runtime, which
   `AppServiceProvider::configureNativeSqlite()` reconfigures (with WAL, a
   10-second busy timeout and `synchronous = NORMAL`), since NativePHP's own
   definition sets none of these.
3. Laravel honours `transaction_mode` only on PHP 8.4 and later; the PHP bundled
   with the app must stay on 8.4 or newer.

## Consequences

- Queue workers no longer fail to claim jobs under concurrent writes.
- Every transaction, including one that only reads, holds the write lock for its
  duration, so transactions must stay short; long work belongs outside them.
- A writer can wait up to the busy timeout (10 seconds) under heavy contention
  before it fails.
