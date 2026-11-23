<?php

namespace App\Services\LaraKube;

use App\Models\LocalClusterState;
use App\Models\Project;
use Illuminate\Support\Facades\Cache;
use Native\Desktop\Facades\ChildProcess;
use Throwable;

/**
 * Live reload: keeps `larakube watch --json` running for each local project that
 * is up, so Horizon, queue workers, Octane and Reverb pick up code edits without
 * a manual "Reload Workers". The CLI decides what a project has to reload; when
 * its first event says nothing, the watcher stops and is not started again until
 * the project's blueprint changes.
 *
 * State lives in the cache (the watcher's output arrives on concurrent event
 * requests, so every write goes through a lock). Whether to watch at all is the
 * project's `live_reload` column.
 *
 * Statuses: off (never started), starting, watching, idle (nothing to reload),
 * failed (could not start or stopped unexpectedly), stopped.
 *
 * @phpstan-type WatchEvent array{at: string, files: list<string>, reload: array{targets: list<string>, ok: bool, ms: int, errors: array<string, string>}|null}
 * @phpstan-type WatchState array{status: string, targets: list<string>, events: list<WatchEvent>, lastReloadAt: string|null, lastReloadOk: bool|null, error: string|null, fingerprint: string|null, buffer: string}
 */
class ProjectWatcher
{
    private const ALIAS_PREFIX = 'watch-project-';

    private const EVENTS_KEPT = 10;

    public function __construct(private ToolLocator $locator) {}

    public static function alias(Project $project): string
    {
        return self::ALIAS_PREFIX.$project->id;
    }

    public static function projectIdFromAlias(string $alias): ?int
    {
        return preg_match('/^'.self::ALIAS_PREFIX.'(\d+)$/', $alias, $matches) === 1 ? (int) $matches[1] : null;
    }

    /**
     * @return WatchState
     */
    public function state(Project|int $project): array
    {
        $id = $project instanceof Project ? $project->id : $project;

        /** @var WatchState $state */
        $state = Cache::get($this->key($id), [
            'status' => 'off',
            'targets' => [],
            'events' => [],
            'lastReloadAt' => null,
            'lastReloadOk' => null,
            'error' => null,
            'fingerprint' => null,
            'buffer' => '',
        ]);

        return $state;
    }

    /**
     * What the project page shows: the state without its bookkeeping.
     *
     * @return array<string, mixed>
     */
    public function summary(Project $project): array
    {
        $state = $this->state($project);
        unset($state['fingerprint'], $state['buffer']);

        return ['enabled' => $project->live_reload, ...$state];
    }

    /**
     * Bring every local project's watcher in line with whether it is running.
     */
    public function reconcileAll(): void
    {
        $workloads = LocalClusterState::current()->workloads_data ?? [];

        Project::query()->whereNotNull('blueprint_cache')->get()
            ->each(fn (Project $project) => $this->reconcile($project, $this->isRunningLocally($project, $workloads)));
    }

    /**
     * Start the watcher for a running project with live reload on; stop it
     * otherwise. A project already known to have nothing to reload (or whose
     * watcher could not start) is left alone until its blueprint changes.
     */
    public function reconcile(Project $project, bool $running): void
    {
        $state = $this->state($project);
        $active = in_array($state['status'], ['starting', 'watching'], true);

        if (! $project->live_reload || ! $running) {
            if ($active) {
                $this->stop($project);
            }

            return;
        }

        if ($active && ChildProcess::get(self::alias($project)) !== null) {
            return;
        }

        if (in_array($state['status'], ['idle', 'failed'], true) && $state['fingerprint'] === $this->fingerprint($project)) {
            return;
        }

        $this->start($project);
    }

    /** Forget an earlier "nothing to reload" or failure, so the next reconcile tries again. */
    public function reset(Project $project): void
    {
        $this->update($project->id, function (array $state): array {
            if (in_array($state['status'], ['idle', 'failed'], true)) {
                $state['status'] = 'stopped';
                $state['error'] = null;
            }

            return $state;
        });
    }

    public function start(Project $project): void
    {
        $alias = self::alias($project);
        $cli = $this->locator->find('larakube');
        $fingerprint = $this->fingerprint($project);

        if ($cli === null) {
            $this->update($project->id, fn (array $state): array => [...$state, 'status' => 'failed', 'error' => 'The LaraKube CLI is not installed.', 'fingerprint' => $fingerprint]);

            return;
        }

        ChildProcess::stop($alias);

        $this->update($project->id, fn (array $state): array => [
            ...$state,
            'status' => 'starting',
            'error' => null,
            'fingerprint' => $fingerprint,
            'buffer' => '',
        ]);

        try {
            $this->locator->start([$cli, 'watch', '--environment=local', '--json', '--no-interaction'], $alias, [], $project->path);
        } catch (Throwable $e) {
            $this->update($project->id, fn (array $state): array => [...$state, 'status' => 'failed', 'error' => "Live reload could not start: {$e->getMessage()}"]);
        }
    }

    public function stop(Project $project): void
    {
        $this->update($project->id, fn (array $state): array => [...$state, 'status' => 'stopped', 'buffer' => '']);

        ChildProcess::stop(self::alias($project));
    }

    /**
     * Fold a chunk of the watcher's stdout (one JSON event per line, possibly
     * split across chunks) into the project's state.
     */
    public function record(int $projectId, string $chunk): void
    {
        $stopAfter = false;

        $this->update($projectId, function (array $state) use ($chunk, &$stopAfter): array {
            $lines = preg_split('/\r\n|\r|\n/', $state['buffer'].$chunk) ?: [];
            $state['buffer'] = (string) array_pop($lines);

            foreach ($lines as $line) {
                $event = json_decode(trim($line), true);

                if (is_array($event) && is_string($event['event'] ?? null)) {
                    $state = $this->apply($state, $event, $stopAfter);
                }
            }

            return $state;
        });

        if ($stopAfter) {
            ChildProcess::stop(self::ALIAS_PREFIX.$projectId);
        }
    }

    /** The watcher process ended. One we did not stop ourselves is a failure. */
    public function exited(int $projectId, int $code): void
    {
        $this->update($projectId, function (array $state) use ($code): array {
            if (in_array($state['status'], ['starting', 'watching'], true)) {
                $state['status'] = 'failed';
                $state['error'] = "Live reload stopped unexpectedly (exit code {$code}).";
            }

            $state['buffer'] = '';

            return $state;
        });
    }

    /**
     * @param  array<string, array{replicas: int, readyReplicas: int, deploymentsCount: int}>  $workloads
     */
    public function isRunningLocally(Project $project, array $workloads): bool
    {
        $name = $project->blueprint_cache['name'] ?? null;
        $name = is_string($name) && $name !== '' ? $name : basename($project->path);

        return ($workloads["{$name}-local"]['readyReplicas'] ?? 0) > 0;
    }

    /**
     * @param  WatchState  $state
     * @param  array<string, mixed>  $event
     * @return WatchState
     */
    private function apply(array $state, array $event, bool &$stopAfter): array
    {
        $at = is_string($event['at'] ?? null) ? $event['at'] : now()->toIso8601String();

        switch ($event['event']) {
            case 'watching':
                $targets = array_values(array_filter((array) ($event['targets'] ?? []), 'is_string'));
                $state['targets'] = $targets;
                $state['error'] = null;
                $state['status'] = $targets === [] ? 'idle' : 'watching';
                $stopAfter = $targets === [];
                break;

            case 'changed':
                array_unshift($state['events'], [
                    'at' => $at,
                    'files' => array_values(array_filter((array) ($event['files'] ?? []), 'is_string')),
                    'reload' => null,
                ]);
                $state['events'] = array_slice($state['events'], 0, self::EVENTS_KEPT);
                break;

            case 'reloaded':
                $results = array_values(array_filter((array) ($event['results'] ?? []), 'is_array'));
                $errors = [];
                foreach ($results as $result) {
                    if (($result['ok'] ?? true) === false && is_string($result['target'] ?? null)) {
                        $errors[$result['target']] = is_string($result['error'] ?? null) ? $result['error'] : 'Reload failed.';
                    }
                }

                $reload = [
                    'targets' => array_values(array_filter(array_column($results, 'target'), 'is_string')),
                    'ok' => $errors === [],
                    'ms' => (int) ($event['ms'] ?? 0),
                    'errors' => $errors,
                ];

                if (isset($state['events'][0]) && $state['events'][0]['reload'] === null) {
                    $state['events'][0]['reload'] = $reload;
                } else {
                    array_unshift($state['events'], ['at' => $at, 'files' => [], 'reload' => $reload]);
                    $state['events'] = array_slice($state['events'], 0, self::EVENTS_KEPT);
                }

                $state['lastReloadAt'] = $at;
                $state['lastReloadOk'] = $reload['ok'];
                break;

            case 'failed':
                $state['status'] = 'failed';
                $state['error'] = is_string($event['error'] ?? null) ? $event['error'] : 'Live reload could not start.';
                $stopAfter = true;
                break;
        }

        return $state;
    }

    /**
     * @param  callable(WatchState): WatchState  $change
     */
    private function update(int $projectId, callable $change): void
    {
        Cache::lock("project_watch_lock:{$projectId}", 5)->block(3, function () use ($projectId, $change): void {
            Cache::forever($this->key($projectId), $change($this->state($projectId)));
        });
    }

    private function fingerprint(Project $project): string
    {
        return md5((string) json_encode($project->blueprint_cache));
    }

    private function key(int $projectId): string
    {
        return "project_watch:{$projectId}";
    }
}
