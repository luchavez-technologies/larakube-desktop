<?php

namespace App\Services;

/**
 * The one server name a user is working with, shared across Tools and Mail
 * (and any future per-server section) — replacing what used to be two
 * independent, uncoordinated session keys (tools.server, mail.server).
 * Takes the ready server names a controller already knows about (from
 * StackCatalog) rather than looking them up itself, so this stays a pure
 * session-continuity fix, not a second source of truth for what's ready.
 */
class CurrentServer
{
    /**
     * @param  list<string>  $readyNames
     */
    public function resolve(array $readyNames, ?string $requested = null): ?string
    {
        if ($requested !== null && in_array($requested, $readyNames, true)) {
            $this->remember($requested);

            return $requested;
        }

        $last = session('current_server');

        if (is_string($last) && in_array($last, $readyNames, true)) {
            return $last;
        }

        return $readyNames[0] ?? null;
    }

    public function remember(string $name): void
    {
        session(['current_server' => $name]);
    }
}
