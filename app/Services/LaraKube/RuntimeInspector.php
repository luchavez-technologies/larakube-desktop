<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Native\Desktop\ChildProcess as ChildProcessInstance;
use Native\Desktop\Facades\ChildProcess;

/**
 * Inspects NativePHP runtime child processes (`queue_default`, `queue_sync`, `scheduler`, and active Run processes)
 * alongside SQLite `jobs` and `failed_jobs` tables for live troubleshooting inside Desktop.
 */
class RuntimeInspector
{
    /** @var list<string> */
    public const SYSTEM_ALIASES = ['queue_default', 'queue_sync', 'scheduler'];

    /**
     * @return array{
     *     processes: list<array{alias: string, pid: ?int, running: bool, kind: string}>,
     *     pending: array{total: int, items: list<array{id: int, queue: string, name: string, attempts: int, reserved: bool, availableAt: string, createdAt: string}>},
     *     failed: array{total: int, items: list<array{id: int, uuid: string, queue: string, name: string, summary: string, exception: string, failedAt: string}>}
     * }
     */
    public function snapshot(): array
    {
        return [
            'processes' => $this->processes(),
            'pending' => $this->pendingJobs(),
            'failed' => $this->failedJobs(),
        ];
    }

    /**
     * @return list<array{alias: string, pid: ?int, running: bool, kind: string}>
     */
    public function processes(): array
    {
        /** @var array<int|string, mixed> $live */
        $live = rescue(fn (): array => ChildProcess::all(), [], report: false);

        $rows = [];

        foreach (self::SYSTEM_ALIASES as $alias) {
            $proc = $live[$alias] ?? null;
            $rows[] = [
                'alias' => $alias,
                'pid' => $proc instanceof ChildProcessInstance ? $proc->pid : null,
                'running' => $proc instanceof ChildProcessInstance,
                'kind' => 'system',
            ];
            unset($live[$alias]);
        }

        foreach ($live as $alias => $proc) {
            $resolvedAlias = $proc instanceof ChildProcessInstance ? $proc->alias : (string) $alias;
            $rows[] = [
                'alias' => $resolvedAlias,
                'pid' => $proc instanceof ChildProcessInstance ? $proc->pid : null,
                'running' => true,
                'kind' => 'run',
            ];
        }

        return $rows;
    }

    /**
     * @return array{total: int, items: list<array{id: int, queue: string, name: string, attempts: int, reserved: bool, availableAt: string, createdAt: string}>}
     */
    public function pendingJobs(int $limit = 50): array
    {
        if (! Schema::hasTable('jobs')) {
            return ['total' => 0, 'items' => []];
        }

        $total = (int) DB::table('jobs')->count();
        $records = DB::table('jobs')->orderBy('id')->limit($limit)->get();

        $items = [];
        foreach ($records as $row) {
            $items[] = [
                'id' => (int) $row->id,
                'queue' => (string) $row->queue,
                'name' => $this->jobDisplayName((string) $row->payload),
                'attempts' => (int) $row->attempts,
                'reserved' => $row->reserved_at !== null,
                'availableAt' => $this->formatTimestamp((int) $row->available_at),
                'createdAt' => $this->formatTimestamp((int) $row->created_at),
            ];
        }

        return ['total' => $total, 'items' => $items];
    }

    /**
     * @return array{total: int, items: list<array{id: int, uuid: string, queue: string, name: string, summary: string, exception: string, failedAt: string}>}
     */
    public function failedJobs(int $limit = 50): array
    {
        if (! Schema::hasTable('failed_jobs')) {
            return ['total' => 0, 'items' => []];
        }

        $total = (int) DB::table('failed_jobs')->count();
        $records = DB::table('failed_jobs')->orderByDesc('id')->limit($limit)->get();

        $items = [];
        foreach ($records as $row) {
            $exception = trim((string) $row->exception);
            $firstLine = strtok($exception, "\r\n");

            $items[] = [
                'id' => (int) $row->id,
                'uuid' => (string) $row->uuid,
                'queue' => (string) $row->queue,
                'name' => $this->jobDisplayName((string) $row->payload),
                'summary' => $firstLine !== false ? $firstLine : 'Job failed without exception output.',
                'exception' => $exception,
                'failedAt' => (string) $row->failed_at,
            ];
        }

        return ['total' => $total, 'items' => $items];
    }

    public function summaryLine(): string
    {
        $processes = $this->processes();
        $liveCount = count(array_filter($processes, fn (array $p): bool => $p['running']));
        $pending = $this->pendingJobs(1)['total'];
        $failed = $this->failedJobs(1)['total'];

        return "Workers & Queues: {$liveCount} live process(es), {$pending} pending job(s), {$failed} failed job(s)";
    }

    public function isSystemAlias(string $alias): bool
    {
        return in_array($alias, self::SYSTEM_ALIASES, true);
    }

    private function jobDisplayName(string $payload): string
    {
        $decoded = json_decode($payload, true);
        if (is_array($decoded) && is_string($decoded['displayName'] ?? null) && $decoded['displayName'] !== '') {
            return $decoded['displayName'];
        }

        return 'Unknown job';
    }

    private function formatTimestamp(int $timestamp): string
    {
        return $timestamp > 0 ? Carbon::createFromTimestamp($timestamp)->toIso8601String() : '';
    }
}
