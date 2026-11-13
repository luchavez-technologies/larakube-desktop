<?php

namespace App\Http\Controllers;

use App\Services\Diagnostics;
use App\Services\LaraKube\RuntimeInspector;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Native\Desktop\Facades\ChildProcess;
use Native\Desktop\Facades\Shell;

class DiagnosticsController extends Controller
{
    public function __invoke(Diagnostics $diagnostics): JsonResponse
    {
        return response()->json(['report' => $diagnostics->report()]);
    }

    public function runtime(RuntimeInspector $inspector): JsonResponse
    {
        return response()->json($inspector->snapshot());
    }

    public function retryQueue(?string $uuid = null): JsonResponse
    {
        $target = $uuid !== null && $uuid !== '' ? [$uuid] : ['all'];
        $exitCode = Artisan::call('queue:retry', ['id' => $target]);

        return response()->json(['ok' => $exitCode === 0]);
    }

    public function flushQueue(): JsonResponse
    {
        $exitCode = Artisan::call('queue:flush');

        return response()->json(['ok' => $exitCode === 0]);
    }

    public function restartProcess(string $alias, RuntimeInspector $inspector): JsonResponse
    {
        if (! $inspector->isSystemAlias($alias)) {
            return response()->json(['ok' => false, 'message' => 'Only system worker processes can be restarted.'], 422);
        }

        ChildProcess::restart($alias);

        return response()->json(['ok' => true]);
    }

    public function stopProcess(string $alias, RuntimeInspector $inspector): JsonResponse
    {
        if ($inspector->isSystemAlias($alias)) {
            return response()->json(['ok' => false, 'message' => 'System worker processes cannot be stopped directly; restart them instead.'], 422);
        }

        ChildProcess::stop($alias);

        return response()->json(['ok' => true]);
    }

    /** Shows the program log (or, before there is one, the data folder) in File Explorer or Finder. */
    public function folder(): JsonResponse
    {
        $data = (string) (getenv('NATIVEPHP_USER_DATA_PATH') ?: ($_SERVER['NATIVEPHP_USER_DATA_PATH'] ?? ''));

        if ($data === '' || ! is_dir($data)) {
            return response()->json(['ok' => false], 404);
        }

        $log = $data.DIRECTORY_SEPARATOR.'logs'.DIRECTORY_SEPARATOR.'main.log';

        Shell::showInFolder(is_file($log) ? $log : $data);

        return response()->json(['ok' => true]);
    }
}
