<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\Wsl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/** The Windows first-run steps that create LaraKube Desktop's own WSL distro; the Setup page runs them one after another. */
class WslSetupController extends Controller
{
    public function progress(Wsl $wsl): JsonResponse
    {
        abort_unless($wsl->isWindows(), 404);

        return response()->json($wsl->downloadProgress());
    }

    public function store(Request $request, string $step, Wsl $wsl, ReadinessCheck $readiness, CliInstaller $installer): JsonResponse
    {
        abort_unless($wsl->isWindows(), 404);

        // Validated up front, outside the try/catch below — a missing path must
        // surface as the normal 422 validation response, not get swallowed into
        // a 200 {"ok": false} by the catch-all Throwable handler.
        $path = $step === 'restore' ? $request->validate(['path' => ['required', 'string']])['path'] : null;

        try {
            $result = match ($step) {
                'enable' => $wsl->enable()
                    ? ['ok' => true, 'message' => 'WSL is turned on. Restart your computer if Windows asked you to.']
                    : ['ok' => false, 'message' => 'WSL was not turned on. The administrator prompt may have been declined.'],
                'download' => $wsl->download(),
                'import' => $wsl->import(),
                'update' => $wsl->update(channel: $installer->channel()),
                'backup' => $wsl->backupUserHome(),
                'reset' => $wsl->reset(),
                // Only ever restores a path this same backup/reset flow produced
                // moments earlier (threaded through by the frontend's own chained
                // steps) — never an arbitrary user-supplied filesystem path.
                'restore' => $wsl->restoreUserHome((string) $path),
                default => abort(404),
            };
        } catch (Throwable $e) {
            report($e);

            return response()->json(['ok' => false, 'message' => "{$step} failed: {$e->getMessage()}"]);
        }

        if (in_array($step, ['import', 'update', 'reset'], true) && $result['ok']) {
            $readiness->forget();
        }

        return response()->json($result);
    }
}
