<?php

namespace App\Http\Controllers;

use App\Services\Wsl;
use Illuminate\Http\JsonResponse;

/** The Windows first-run steps that create LaraKube Desktop's own WSL distro; the Setup page runs them one after another. */
class WslSetupController extends Controller
{
    public function store(string $step, Wsl $wsl): JsonResponse
    {
        abort_unless($wsl->isWindows(), 404);

        $result = match ($step) {
            'enable' => $wsl->enable()
                ? ['ok' => true, 'message' => 'WSL is turned on. Restart your computer if Windows asked you to.']
                : ['ok' => false, 'message' => 'WSL was not turned on. The administrator prompt may have been declined.'],
            'download' => $wsl->download(),
            'import' => $wsl->import(),
            default => abort(404),
        };

        return response()->json($result);
    }
}
