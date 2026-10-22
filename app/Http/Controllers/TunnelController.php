<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\TunnelManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TunnelController extends Controller
{
    public function index(TunnelManager $tunnels): JsonResponse
    {
        return response()->json([
            'success' => true,
            'tunnels' => $tunnels->all(),
        ]);
    }

    public function start(Request $request, TunnelManager $tunnels): JsonResponse
    {
        $validated = $request->validate([
            'namespace' => ['required', 'string'],
            'service' => ['required', 'string'],
            'localPort' => ['required', 'integer', 'between:1,65535'],
            'remotePort' => ['required', 'integer', 'between:1,65535'],
            'context' => ['nullable', 'string'],
        ]);

        $started = $tunnels->start(
            namespace: $validated['namespace'],
            service: $validated['service'],
            localPort: (int) $validated['localPort'],
            remotePort: (int) $validated['remotePort'],
            context: $validated['context'] ?? null,
        );

        return response()->json([
            'success' => $started,
            'tunnels' => $tunnels->all(),
        ]);
    }

    public function stop(Request $request, TunnelManager $tunnels): JsonResponse
    {
        $validated = $request->validate([
            'namespace' => ['required', 'string'],
            'service' => ['required', 'string'],
            'localPort' => ['required', 'integer', 'between:1,65535'],
        ]);

        $stopped = $tunnels->stop(
            namespace: $validated['namespace'],
            service: $validated['service'],
            localPort: (int) $validated['localPort'],
        );

        return response()->json([
            'success' => $stopped,
            'tunnels' => $tunnels->all(),
        ]);
    }
}
