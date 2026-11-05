<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class CloudflareController extends Controller
{
    /**
     * Verifies a Cloudflare API token against the live Cloudflare API:
     * 1. Confirms the token is active via /user/tokens/verify.
     * 2. Confirms "Zone -> Zone -> Read" via /zones.
     * 3. Confirms "Zone -> DNS -> Edit" via /zones/{id}/dns_records.
     * 4. Confirms "Zone -> Zone Settings -> Read" via /zones/{id}/settings/ssl.
     */
    public function verifyToken(Request $request): JsonResponse
    {
        $token = trim((string) $request->input('token'));

        if ($token === '') {
            return response()->json([
                'valid' => false,
                'error' => 'Please provide a Cloudflare API token.',
                'code' => 'missing_token',
            ], 422);
        }

        try {
            // 1. Verify token validity
            $verifyRes = Http::timeout(8)
                ->withToken($token)
                ->get('https://api.cloudflare.com/client/v4/user/tokens/verify');

            if (! $verifyRes->successful() || ($verifyRes->json('result.status') !== 'active')) {
                $errorMsg = $verifyRes->json('errors.0.message') ?? 'Invalid or expired Cloudflare API token.';

                return response()->json([
                    'valid' => false,
                    'error' => $errorMsg,
                    'code' => 'invalid_token',
                ]);
            }

            // 2. Verify Zone read access
            $zonesRes = Http::timeout(8)
                ->withToken($token)
                ->get('https://api.cloudflare.com/client/v4/zones', ['per_page' => 10]);

            if ($zonesRes->status() === 403) {
                return response()->json([
                    'valid' => false,
                    'error' => 'Token is missing "Zone -> Zone -> Read" permission or has no zone resources included.',
                    'code' => 'missing_zone_read',
                ]);
            }

            if (! $zonesRes->successful()) {
                $errorMsg = $zonesRes->json('errors.0.message') ?? 'Could not list Cloudflare zones.';

                return response()->json([
                    'valid' => false,
                    'error' => $errorMsg,
                    'code' => 'zones_failed',
                ]);
            }

            $zones = $zonesRes->json('result') ?? [];
            $zoneNames = array_values(array_filter(array_column($zones, 'name')));

            if (empty($zones)) {
                return response()->json([
                    'valid' => true,
                    'warning' => 'Token is active, but no active Cloudflare zones were found in the token scope. Ensure Zone Resources includes your domain(s).',
                    'zones' => [],
                    'permissions' => [
                        'token' => true,
                        'zone_read' => true,
                        'dns_edit' => true,
                        'zone_settings_read' => true,
                    ],
                ]);
            }

            // 3. Test DNS edit permission on the first zone
            $firstZoneId = $zones[0]['id'];
            $dnsRes = Http::timeout(8)
                ->withToken($token)
                ->get("https://api.cloudflare.com/client/v4/zones/{$firstZoneId}/dns_records", ['per_page' => 1]);

            if ($dnsRes->status() === 403) {
                return response()->json([
                    'valid' => false,
                    'error' => 'Token is missing "Zone -> DNS -> Edit" permission. ExternalDNS will fail to create records.',
                    'code' => 'missing_dns_edit',
                    'zones' => $zoneNames,
                ]);
            }

            // 4. Test Zone Settings read permission on the first zone
            $settingsRes = Http::timeout(8)
                ->withToken($token)
                ->get("https://api.cloudflare.com/client/v4/zones/{$firstZoneId}/settings/ssl");

            if ($settingsRes->status() === 403) {
                return response()->json([
                    'valid' => false,
                    'error' => 'Token is missing "Zone -> Zone Settings -> Read" permission. LaraKube cannot confirm SSL/TLS proxy mode.',
                    'code' => 'missing_zone_settings_read',
                    'zones' => $zoneNames,
                ]);
            }

            return response()->json([
                'valid' => true,
                'message' => 'Token verified successfully with DNS Edit and Zone Settings Read permissions.',
                'zones' => $zoneNames,
                'permissions' => [
                    'token' => true,
                    'zone_read' => true,
                    'dns_edit' => true,
                    'zone_settings_read' => true,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'valid' => false,
                'error' => 'Could not connect to Cloudflare API. Please check your internet connection and try again.',
                'code' => 'connection_failed',
            ]);
        }
    }
}
