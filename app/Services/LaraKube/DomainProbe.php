<?php

declare(strict_types=1);

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Http;
use Throwable;

final class DomainProbe
{
    /**
     * Probe public DNS resolution and TLS/HTTPS readiness for a hostname.
     *
     * @return array{
     *     host: string,
     *     dns: array{ready: bool, records: list<string>, detail: string},
     *     https: array{ready: bool, status: int|null, detail: string},
     * }
     */
    public function check(string $host): array
    {
        $normalized = $this->normalizeHost($host);

        if ($normalized === '' || $this->isLocalDomain($normalized)) {
            return [
                'host' => $normalized,
                'dns' => [
                    'ready' => false,
                    'records' => [],
                    'detail' => $normalized === ''
                        ? 'No hostname provided.'
                        : 'Local development domain does not use public DNS.',
                ],
                'https' => [
                    'ready' => false,
                    'status' => null,
                    'detail' => $normalized === ''
                        ? 'No hostname provided.'
                        : 'Local development domain uses local cluster TLS.',
                ],
            ];
        }

        $dns = $this->checkDns($normalized);
        $https = $this->checkHttps($normalized, $dns['ready']);

        return [
            'host' => $normalized,
            'dns' => $dns,
            'https' => $https,
        ];
    }

    /**
     * Normalize a raw host or URL into a lowercase bare hostname.
     */
    public function normalizeHost(string $host): string
    {
        $trimmed = trim($host);

        if ($trimmed === '') {
            return '';
        }

        if (str_contains($trimmed, '://')) {
            $parsed = parse_url($trimmed, PHP_URL_HOST);

            return is_string($parsed) ? strtolower(rtrim($parsed, '.')) : '';
        }

        $withoutPath = explode('/', $trimmed)[0];
        $withoutPort = explode(':', $withoutPath)[0];

        return strtolower(rtrim($withoutPort, '.'));
    }

    /**
     * Query public DNS-over-HTTPS so OS negative-TTL caching does not hide new ExternalDNS records.
     *
     * @return array{ready: bool, records: list<string>, detail: string}
     */
    private function checkDns(string $host): array
    {
        try {
            $response = Http::timeout(3)
                ->withHeaders(['Accept' => 'application/dns-json'])
                ->get('https://cloudflare-dns.com/dns-query', [
                    'name' => $host,
                    'type' => 'A',
                ]);

            if (! $response->successful()) {
                return [
                    'ready' => false,
                    'records' => [],
                    'detail' => 'Waiting for ExternalDNS record...',
                ];
            }

            /** @var array<string, mixed> $payload */
            $payload = $response->json() ?? [];
            $status = $payload['Status'] ?? null;
            $answers = is_array($payload['Answer'] ?? null) ? $payload['Answer'] : [];

            $records = [];
            foreach ($answers as $answer) {
                if (! is_array($answer)) {
                    continue;
                }

                $type = $answer['type'] ?? null;
                $data = $answer['data'] ?? null;

                // Type 1 = A, Type 5 = CNAME
                if (($type === 1 || $type === 5) && is_string($data) && $data !== '') {
                    $records[] = rtrim($data, '.');
                }
            }

            $records = array_values(array_unique($records));

            if ($status === 0 && $records !== []) {
                return [
                    'ready' => true,
                    'records' => $records,
                    'detail' => 'Resolved: '.implode(', ', array_slice($records, 0, 2)),
                ];
            }
        } catch (Throwable) {
            return [
                'ready' => false,
                'records' => [],
                'detail' => 'Waiting for ExternalDNS record...',
            ];
        }

        return [
            'ready' => false,
            'records' => [],
            'detail' => 'Waiting for ExternalDNS record...',
        ];
    }

    /**
     * Verify live TLS certificate validity and reject Cloudflare origin SSL errors (525/526).
     *
     * @return array{ready: bool, status: int|null, detail: string}
     */
    private function checkHttps(string $host, bool $dnsReady): array
    {
        if (! $dnsReady) {
            return [
                'ready' => false,
                'status' => null,
                'detail' => 'Waiting for DNS resolution before verifying TLS...',
            ];
        }

        try {
            $response = Http::timeout(4)
                ->withOptions([
                    'verify' => true,
                    'allow_redirects' => false,
                ])
                ->get("https://{$host}");

            $status = $response->status();

            if ($status === 525 || $status === 526) {
                return [
                    'ready' => false,
                    'status' => $status,
                    'detail' => "Cloudflare {$status}: waiting for Traefik Let's Encrypt certificate...",
                ];
            }

            if ($status >= 100 && $status < 600) {
                return [
                    'ready' => true,
                    'status' => $status,
                    'detail' => "Valid HTTPS certificate (HTTP {$status})",
                ];
            }
        } catch (Throwable $e) {
            $message = $e->getMessage();
            $isTlsError = str_contains($message, 'SSL')
                || str_contains($message, 'certificate')
                || str_contains($message, 'cURL error 60')
                || str_contains($message, 'cURL error 35');

            return [
                'ready' => false,
                'status' => null,
                'detail' => $isTlsError
                    ? "Waiting for Traefik Let's Encrypt certificate..."
                    : 'Waiting for Traefik HTTPS endpoint...',
            ];
        }

        return [
            'ready' => false,
            'status' => null,
            'detail' => 'Waiting for Traefik HTTPS endpoint...',
        ];
    }

    private function isLocalDomain(string $host): bool
    {
        return $host === 'localhost'
            || str_ends_with($host, '.test')
            || str_ends_with($host, '.localhost');
    }
}
