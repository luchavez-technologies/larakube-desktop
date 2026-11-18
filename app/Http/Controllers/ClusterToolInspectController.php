<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolInspector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The app page's Configuration and Logs tabs: an installed app's ConfigMaps
 * and Secrets, one Secret value at a time, and its components' logs.
 */
class ClusterToolInspectController extends Controller
{
    public function __construct(private StackCatalog $stacks, private ToolInspector $inspector) {}

    public function resources(Request $request, string $server, string $tool): JsonResponse
    {
        $result = $this->inspector->resources($this->context($server), $tool, $request->string('domain')->trim()->toString());

        return response()->json($result ?? ['success' => false, 'error' => 'Could not read this app\'s configuration.']);
    }

    /** POST, so a revealed value never appears in a URL or an access log. */
    public function reveal(Request $request, string $server, string $tool): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:253'],
            'key' => ['required', 'string', 'max:253'],
            'domain' => ['nullable', 'string'],
        ]);

        $result = $this->inspector->reveal($this->context($server), $tool, (string) ($validated['domain'] ?? ''), $validated['name'], $validated['key']);

        return response()->json($result ?? ['success' => false, 'error' => 'Could not read that value.']);
    }

    public function logs(Request $request, string $server, string $tool): JsonResponse
    {
        $result = $this->inspector->logs(
            $this->context($server),
            $tool,
            $request->string('domain')->trim()->toString(),
            $request->string('component')->trim()->toString() ?: null,
            $request->string('since_time')->trim()->toString() ?: null,
            max(10, min(500, $request->integer('tail', 200))),
        );

        return response()->json($result ?? ['success' => false, 'error' => 'Could not read this app\'s logs.']);
    }

    private function context(string $server): string
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return (string) $stack['context'];
    }
}
