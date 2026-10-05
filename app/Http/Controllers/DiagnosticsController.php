<?php

namespace App\Http\Controllers;

use App\Services\Diagnostics;
use Illuminate\Http\JsonResponse;

class DiagnosticsController extends Controller
{
    public function __invoke(Diagnostics $diagnostics): JsonResponse
    {
        return response()->json(['report' => $diagnostics->report()]);
    }
}
