<?php

namespace App\Services\Branding;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CloudBrandingClient
{
    /**
     * Get the active branding metadata from the cloud endpoint.
     *
     * @return array{theme: string, month?: string, icon_url: string, sha256?: string}|null
     */
    public function getActiveBranding(): ?array
    {
        $endpoint = $this->endpoint();
        if (empty($endpoint)) {
            return null;
        }

        try {
            $response = Http::timeout(5)->acceptJson()->get($endpoint);

            if (! $response->successful()) {
                return null;
            }

            $data = $response->json();
            if (! is_array($data) || empty($data['icon_url'])) {
                return null;
            }

            return [
                'theme' => (string) ($data['theme'] ?? 'seasonal'),
                'month' => (string) ($data['month'] ?? date('Y-m')),
                'icon_url' => (string) $data['icon_url'],
                'sha256' => isset($data['sha256']) ? (string) $data['sha256'] : null,
            ];
        } catch (\Throwable $e) {
            Log::debug('CloudBrandingClient: failed to fetch branding metadata', [
                'endpoint' => $endpoint,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Download a remote icon image to a local cached path.
     */
    public function downloadIcon(string $url): ?string
    {
        try {
            $response = Http::timeout(15)->get($url);

            if (! $response->successful()) {
                return null;
            }

            $body = $response->body();
            if (empty($body)) {
                return null;
            }

            $cacheDir = storage_path('app/branding/cache');
            File::ensureDirectoryExists($cacheDir);

            $parsedPath = parse_url($url, PHP_URL_PATH);
            $ext = is_string($parsedPath) ? pathinfo($parsedPath, PATHINFO_EXTENSION) : 'png';
            $ext = in_array(strtolower($ext), ['png', 'jpg', 'jpeg', 'webp'], true) ? $ext : 'png';

            $targetPath = $cacheDir.'/cloud-icon-'.md5($url).'.'.$ext;
            file_put_contents($targetPath, $body);

            return $targetPath;
        } catch (\Throwable $e) {
            Log::debug('CloudBrandingClient: failed to download remote icon', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Resolve the branding API endpoint URL.
     */
    public function endpoint(): ?string
    {
        $custom = config('services.cloud.branding_url');
        if (is_string($custom) && ! empty($custom)) {
            return $custom;
        }

        $cloudUrl = (string) config('services.cloud.url', 'https://cloud.larakube.app');

        return rtrim($cloudUrl, '/').'/api/v1/branding/icon';
    }
}
