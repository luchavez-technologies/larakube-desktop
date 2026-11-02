<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\ClusterToolEnv;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A Cluster App's custom environment variables — the Apps Store equivalent
 * of ProjectDotenvController, minus the local/cluster diff a Project has
 * (a Cluster App has no local .env file; the cluster IS the source of truth).
 */
class ClusterToolEnvController extends Controller
{
    public function __construct(private StackCatalog $stacks, private ClusterToolEnv $env) {}

    public function status(Request $request, string $server, string $tool): JsonResponse
    {
        $context = (string) $this->readyServer($server)['context'];
        $domain = $request->string('domain')->trim()->toString();
        $reveal = $request->boolean('reveal');

        $status = $this->env->get($context, $tool, $domain, $reveal);

        return response()->json(['status' => $status]);
    }

    public function update(Request $request, string $server, string $tool): JsonResponse
    {
        $context = (string) $this->readyServer($server)['context'];
        $domain = $request->string('domain')->trim()->toString();
        $restart = $request->boolean('restart');

        /** @var array<string, string> $set */
        $set = array_map('strval', (array) $request->input('set', []));
        /** @var array<string, string> $setSecret */
        $setSecret = array_map('strval', (array) $request->input('setSecret', []));
        /** @var list<string> $unset */
        $unset = array_values(array_map('strval', (array) $request->input('unset', [])));

        $result = $this->env->update($context, $tool, $domain, $set, $setSecret, $unset, $restart);

        return response()->json($result);
    }

    /** @return array<string, mixed> */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return $stack;
    }
}
