<?php

namespace App\Jobs\Sync;

use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

/**
 * Mirrors `larakube ocis:show` and `drive:ext:show` for one server's oCIS Drive
 * install into the drive ClusterTool row.
 */
class SyncDriveJob extends SyncJob
{
    public const FRESH_SECONDS = 600;

    public function __construct(public int $serverId) {}

    protected function uniqueKey(): string
    {
        return (string) $this->serverId;
    }

    public function handle(ToolLocator $locator): void
    {
        $server = Server::find($this->serverId);

        if ($server === null || $server->context === null) {
            return;
        }

        $driveTool = $server->driveTool();

        if ($driveTool === null) {
            return;
        }

        $driveTool->update(['sync_status' => 'syncing']);

        $info = $this->json($locator, ['ocis:show', 'production', "--context={$server->context}", '--json']);

        if ($info === null) {
            $driveTool->update(['sync_status' => 'error', 'last_sync_error' => 'Could not reach ownCloud Infinite Scale (oCIS).']);

            return;
        }

        $extensions = [];
        $extData = $this->json($locator, ['drive:ext:show', 'production', "--context={$server->context}", '--json']);
        if (is_array($extData['extensions'] ?? null)) {
            $extensions = array_values($extData['extensions']);
        } else {
            $rawOutput = $this->raw($locator, ['drive:ext:show', 'production', "--context={$server->context}"]);
            if ($rawOutput !== null) {
                $extensions = $this->parseTableExtensions($rawOutput);
            }
        }

        $driveTool->update([
            'installed' => (bool) ($info['installed'] ?? true),
            'sync_status' => 'fresh',
            'last_synced_at' => now(),
            'last_sync_error' => null,
            'data' => [
                ...($driveTool->data ?? []),
                'driveInfo' => $info,
                'extensions' => $extensions,
            ],
        ]);
    }

    /**
     * @param  list<string>  $arguments
     */
    private function raw(ToolLocator $locator, array $arguments): ?string
    {
        $cli = $locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $locator->isolate([$cli, ...$arguments, '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout(60)->run($isolated['command']);

        return $result->successful() ? $result->output() : null;
    }

    /**
     * @return list<array{id: string, name: string, version: string, installed: bool}>
     */
    private function parseTableExtensions(string $output): array
    {
        $extensions = [];
        $lines = explode("\n", $output);
        foreach ($lines as $line) {
            if (str_contains($line, 'Installed') || str_contains($line, 'Available')) {
                $parts = array_map('trim', explode('│', $line));
                if (count($parts) < 4) {
                    $parts = array_map('trim', explode('|', $line));
                }
                $parts = array_values(array_filter($parts, fn (string $p): bool => $p !== ''));
                if (count($parts) >= 4 && $parts[0] !== 'ID') {
                    $extensions[] = [
                        'id' => $parts[0],
                        'name' => $parts[1],
                        'version' => $parts[2],
                        'installed' => str_contains($parts[3], 'Installed'),
                    ];
                }
            }
        }

        return $extensions;
    }

    /**
     * @param  list<string>  $arguments
     * @return array<string, mixed>|null
     */
    private function json(ToolLocator $locator, array $arguments): ?array
    {
        $cli = $locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $locator->isolate([$cli, ...$arguments, '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout(60)->run($isolated['command']);

        $output = trim($result->output());

        $startArr = strpos($output, '[');
        $startObj = strpos($output, '{');

        if ($startArr !== false && ($startObj === false || $startArr < $startObj)) {
            $endArr = strrpos($output, ']');
            if ($endArr !== false && $endArr >= $startArr) {
                $output = substr($output, $startArr, $endArr - $startArr + 1);
            }
        } elseif ($startObj !== false) {
            $endObj = strrpos($output, '}');
            if ($endObj !== false && $endObj >= $startObj) {
                $output = substr($output, $startObj, $endObj - $startObj + 1);
            }
        }

        $decoded = json_decode($output, true);

        return is_array($decoded) ? $decoded : null;
    }
}
