<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Native\Desktop\Events\AutoUpdater\CheckingForUpdate;
use Native\Desktop\Events\AutoUpdater\DownloadProgress;
use Native\Desktop\Events\AutoUpdater\Error;
use Native\Desktop\Events\AutoUpdater\UpdateAvailable;
use Native\Desktop\Events\AutoUpdater\UpdateDownloaded;
use Native\Desktop\Events\AutoUpdater\UpdateNotAvailable;
use Native\Desktop\Facades\AutoUpdater;

/**
 * What the app's updater is doing, kept from its events so the Settings card can show it. The updater
 * itself runs in the Electron process and only exists in a packaged build.
 */
class AppUpdates
{
    private const KEY = 'app-updates';

    /** @return array{enabled: bool, version: string, state: 'idle'|'checking'|'downloading'|'ready'|'current'|'error', latest: ?string, percent: int, message: ?string} */
    public function status(): array
    {
        $known = $this->known();

        return [
            'enabled' => $this->enabled(),
            'version' => (string) config('nativephp.version'),
            'state' => $known['state'],
            'latest' => $known['latest'],
            'percent' => $known['percent'],
            'message' => $known['message'],
        ];
    }

    public function enabled(): bool
    {
        return (bool) config('nativephp.updater.enabled') && app()->isProduction();
    }

    public function check(): void
    {
        $this->remember('checking');
        AutoUpdater::checkForUpdates();
    }

    public function install(): void
    {
        AutoUpdater::quitAndInstall();
    }

    public function listen(): void
    {
        $events = app('events');

        $events->listen(CheckingForUpdate::class, fn () => $this->remember('checking'));
        $events->listen(UpdateNotAvailable::class, fn () => $this->remember('current'));
        $events->listen(UpdateAvailable::class, fn (UpdateAvailable $event) => $this->remember('downloading', latest: $event->version));
        $events->listen(DownloadProgress::class, fn (DownloadProgress $event) => $this->remember('downloading', percent: (int) round($event->percent)));
        $events->listen(UpdateDownloaded::class, fn (UpdateDownloaded $event) => $this->remember('ready', latest: $event->version, percent: 100));
        $events->listen(Error::class, fn (Error $event) => $this->remember('error', message: $event->message));
    }

    /** @return array{state: 'idle'|'checking'|'downloading'|'ready'|'current'|'error', latest: ?string, percent: int, message: ?string} */
    private function known(): array
    {
        $stored = Cache::get(self::KEY);
        $stored = is_array($stored) ? $stored : [];
        $state = $stored['state'] ?? 'idle';

        return [
            'state' => in_array($state, ['checking', 'downloading', 'ready', 'current', 'error'], true) ? $state : 'idle',
            'latest' => is_string($stored['latest'] ?? null) ? $stored['latest'] : null,
            'percent' => is_int($stored['percent'] ?? null) ? $stored['percent'] : 0,
            'message' => is_string($stored['message'] ?? null) ? $stored['message'] : null,
        ];
    }

    private function remember(string $state, ?string $latest = null, ?int $percent = null, ?string $message = null): void
    {
        $previous = $this->known();

        Cache::put(self::KEY, [
            'state' => $state,
            'latest' => $latest ?? $previous['latest'],
            'percent' => $percent ?? ($state === 'downloading' ? $previous['percent'] : 0),
            'message' => $message,
        ], now()->addDay());
    }
}
