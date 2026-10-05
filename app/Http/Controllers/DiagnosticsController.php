<?php

namespace App\Http\Controllers;

use App\Services\Diagnostics;
use Illuminate\Http\JsonResponse;
use Native\Desktop\Facades\Shell;

class DiagnosticsController extends Controller
{
    public function __invoke(Diagnostics $diagnostics): JsonResponse
    {
        return response()->json(['report' => $diagnostics->report()]);
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
