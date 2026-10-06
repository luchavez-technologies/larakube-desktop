<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class HealthPing
{
    public const HISTORY_LIMIT = 10;

    public const TTL_SECONDS = 300;

    /**
     * Measure endpoint response latency and uptime status.
     *
     * @return array{isUp: bool, status: ?int, latencyMs: ?int, history: list<int>, checkedAt: string}
     */
    public function check(?string $url): array
    {
        if (empty($url)) {
            return [
                'isUp' => false,
                'status' => null,
                'latencyMs' => null,
                'history' => [],
                'checkedAt' => now()->toIso8601String(),
            ];
        }

        $normalized = str_starts_with($url, 'http://') || str_starts_with($url, 'https://')
            ? $url
            : "https://{$url}";

        $host = parse_url($normalized, PHP_URL_HOST) ?: $url;
        $historyKey = "health-ping:history:{$host}";

        $start = microtime(true);
        $status = null;
        $isUp = false;

        try {
            // Attempt /up first (standard Laravel 11 health check) with 3s timeout
            $target = rtrim($normalized, '/').'/up';
            $response = Http::timeout(3)->withoutVerifying()->get($target);

            if ($response->status() === 404) {
                // Fall back to root URL if /up is not present
                $response = Http::timeout(3)->withoutVerifying()->get($normalized);
            }

            $latency = (int) round((microtime(true) - $start) * 1000);
            $status = $response->status();
            $isUp = $status >= 200 && $status < 400;
        } catch (\Throwable) {
            $latency = null;
            $isUp = false;
        }

        $history = Cache::get($historyKey, []);
        if (! is_array($history)) {
            $history = [];
        }

        if ($latency !== null) {
            $history[] = $latency;
            if (count($history) > self::HISTORY_LIMIT) {
                $history = array_slice($history, -self::HISTORY_LIMIT);
            }
            Cache::put($historyKey, $history, self::TTL_SECONDS);
        }

        return [
            'isUp' => $isUp,
            'status' => $status,
            'latencyMs' => $latency,
            'history' => array_values($history),
            'checkedAt' => now()->toIso8601String(),
        ];
    }
}
