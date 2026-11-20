<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\FolderPicker;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolInspector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Edge Functions card on a Supabase app page: what is deployed (`supabase:functions:list`),
 * deploying a local folder (`supabase:functions:deploy`) and deleting one (`supabase:functions:delete`),
 * each as an ordinary run. The folder of the last
 * deploy is read back from that run, so redeploying is one click.
 */
class SupabaseFunctionsController extends Controller
{
    public function __construct(private StackCatalog $stacks, private ToolInspector $inspector) {}

    public function index(Request $request, string $server): JsonResponse
    {
        $domain = $request->string('domain')->trim()->toString();
        $result = $this->inspector->supabaseFunctions($this->context($server), $domain)
            ?? ['success' => false, 'error' => 'Could not read the deployed functions.'];

        return response()->json([...$result, 'lastDeploy' => $this->lastDeploy($server, $domain)]);
    }

    /**
     * Deploys `path` when given (the "Deploy again" button), otherwise asks for a folder first,
     * starting the picker at the last one used.
     */
    public function deploy(Request $request, string $server, FolderPicker $picker): JsonResponse
    {
        $validated = $request->validate([
            'domain' => ['required', 'string', 'max:253'],
            'path' => ['nullable', 'string', 'max:4096'],
        ]);
        $context = $this->context($server);
        $domain = $validated['domain'];

        $path = $validated['path'] ?? $picker->pick('Choose your supabase/functions folder', $this->lastDeploy($server, $domain)['path'] ?? null);
        if ($path === null) {
            return response()->json(['started' => false, 'cancelled' => true]);
        }
        if (! is_dir($path)) {
            return response()->json(['started' => false, 'error' => "No folder at {$path}."], 422);
        }

        $run = app(CliRunner::class)->start(
            label: "Deploy Edge Functions to {$domain}",
            arguments: ['supabase:functions:deploy', 'production', "--context={$context}", "--domain={$domain}", "--path={$path}"],
            kind: RunKind::DeploySupabaseFunctions,
            subject: 'supabase',
            meta: ['server' => $server, 'context' => $context, 'tool' => 'supabase', 'host' => $domain, 'path' => $path],
            targetType: 'tool',
            targetName: 'Supabase',
            serverName: $server,
            context: $context,
            tool: 'supabase',
        );

        return response()->json(['started' => true, 'run' => $run->id]);
    }

    /** Deletes one function. The card asks first, so the CLI runs with --force. */
    public function destroy(Request $request, string $server): JsonResponse
    {
        $validated = $request->validate([
            'domain' => ['required', 'string', 'max:253'],
            'function' => ['required', 'string', 'max:128', 'regex:/^[A-Za-z0-9_-]+$/', 'not_in:main'],
        ]);
        $context = $this->context($server);
        $domain = $validated['domain'];
        $function = $validated['function'];

        $run = app(CliRunner::class)->start(
            label: "Delete Edge Function {$function} from {$domain}",
            arguments: ['supabase:functions:delete', 'production', "--context={$context}", "--domain={$domain}", "--function={$function}", '--force'],
            kind: RunKind::DeleteSupabaseFunction,
            subject: 'supabase',
            meta: ['server' => $server, 'context' => $context, 'tool' => 'supabase', 'host' => $domain, 'function' => $function],
            targetType: 'tool',
            targetName: 'Supabase',
            serverName: $server,
            context: $context,
            tool: 'supabase',
        );

        return response()->json(['started' => true, 'run' => $run->id]);
    }

    /** @return array{path: string, status: string, finishedAt: ?string}|null */
    private function lastDeploy(string $server, string $domain): ?array
    {
        $run = Run::query()
            ->where('kind', RunKind::DeploySupabaseFunctions)
            ->where('meta->server', $server)
            ->where('meta->host', $domain)
            ->latest('id')
            ->first();

        $path = $run?->meta['path'] ?? null;

        return is_string($path) && $path !== ''
            ? ['path' => $path, 'status' => $run->status->value, 'finishedAt' => $run->finished_at?->toIso8601String()]
            : null;
    }

    private function context(string $server): string
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return (string) $stack['context'];
    }
}
