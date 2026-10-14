<?php

namespace App\Jobs\Sync;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;

class SyncAppIconJob extends SyncJob
{
    /** Monthly refresh window (30 days) */
    public const FRESH_SECONDS = 86400 * 30;

    protected function uniqueKey(): string
    {
        return 'monthly-branding';
    }

    public function handle(): void
    {
        $metaPath = storage_path('app/branding/current.json');

        if (file_exists($metaPath)) {
            $data = json_decode((string) file_get_contents($metaPath), true);
            if (is_array($data) && ! empty($data['updated_at'])) {
                try {
                    $lastUpdated = Carbon::parse($data['updated_at']);
                    if ($lastUpdated->diffInSeconds(now()) < self::FRESH_SECONDS) {
                        return;
                    }
                } catch (\Throwable) {
                    // Re-sync if date parsing fails
                }
            }
        }

        try {
            Artisan::call('icon:sync');
        } catch (\Throwable $e) {
            Log::debug('SyncAppIconJob: failed to sync icon', [
                'error' => $e->getMessage(),
            ]);
        }
    }
}
