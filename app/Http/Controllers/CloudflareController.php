<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;

class CloudflareController extends Controller
{
    /**
     * Verifies a Cloudflare API token by driving the LaraKube CLI as a subprocess (Desktop ADR 0001):
     * larakube dns:verify --provider=cloudflare --token=... --json --no-interaction
     */
    public function verifyToken(Request $request, ToolLocator $locator): JsonResponse
    {
        $token = trim((string) $request->input('token'));

        if ($token === '') {
            return response()->json([
                'valid' => false,
                'error' => 'Please provide a Cloudflare API token.',
                'code' => 'missing_token',
            ], 422);
        }

        $cli = $locator->find('larakube');

        if ($cli === null) {
            return response()->json([
                'valid' => false,
                'error' => 'LaraKube CLI binary not found. Please ensure larakube is installed.',
                'code' => 'cli_not_found',
            ], 500);
        }

        $isolated = $locator->isolate(
            [$cli, 'dns:verify', '--provider=cloudflare', '--token='.$token, '--json', '--no-interaction'],
            ['LARAKUBE_EXECUTION_CONTEXT' => 'host'],
        );

        try {
            $result = Process::env($isolated['environment'])->timeout(20)->run($isolated['command']);
        } catch (\Throwable $e) {
            return response()->json([
                'valid' => false,
                'error' => 'Could not execute LaraKube CLI: '.$e->getMessage(),
                'code' => 'execution_failed',
            ], 500);
        }

        $cleanOutput = trim(str_replace("\0", '', $result->output()));
        $cleanError = trim(str_replace("\0", '', $result->errorOutput()));
        $lines = $cleanOutput !== '' ? (preg_split('/\R/', $cleanOutput) ?: []) : [];
        $data = $lines !== [] ? json_decode((string) end($lines), true) : null;

        if (! is_array($data)) {
            $detail = $cleanError !== '' ? $cleanError : $cleanOutput;
            $wslHint = $detail !== '' && (str_contains(strtolower($detail), 'wsl') || str_contains(strtolower($detail), 'larakube-ubuntu'));
            $error = match (true) {
                $wslHint => 'Invalid response from LaraKube CLI verification. Update the LaraKube CLI in Setup and retry.',
                $detail !== '' => 'Invalid response from LaraKube CLI verification: '.str($detail)->limit(200)->toString(),
                default => 'Invalid response from LaraKube CLI verification.',
            };

            return response()->json([
                'valid' => false,
                'error' => $error,
                'code' => 'invalid_response',
            ], 500);
        }

        $isValid = (bool) ($data['valid'] ?? false);
        $zones = (array) ($data['zones'] ?? []);
        $errors = (array) ($data['errors'] ?? []);
        $checks = (array) ($data['checks'] ?? []);

        $errorMsg = ! empty($errors) ? implode(' ', $errors) : null;

        if ($isValid) {
            return response()->json([
                'valid' => true,
                'message' => 'Token verified successfully with DNS Edit and Zone Settings Read permissions.',
                'zones' => $zones,
                'permissions' => [
                    'token' => $checks['token_active'] ?? true,
                    'zone_read' => $checks['zones_accessible'] ?? true,
                    'dns_edit' => $checks['dns_edit'] ?? true,
                    'zone_settings_read' => $checks['ssl_read'] ?? true,
                ],
            ]);
        }

        return response()->json([
            'valid' => false,
            'error' => $errorMsg ?: 'Cloudflare API token verification failed.',
            'zones' => $zones,
            'code' => 'verification_failed',
            'permissions' => [
                'token' => $checks['token_active'] ?? false,
                'zone_read' => $checks['zones_accessible'] ?? false,
                'dns_edit' => $checks['dns_edit'] ?? false,
                'zone_settings_read' => $checks['ssl_read'] ?? false,
            ],
        ]);
    }
}
