<?php

namespace App\Http\Controllers;

use App\Services\AppUpdates;
use Illuminate\Http\JsonResponse;

class UpdatesController extends Controller
{
    public function status(AppUpdates $updates): JsonResponse
    {
        return response()->json($updates->status());
    }

    public function check(AppUpdates $updates): JsonResponse
    {
        abort_unless($updates->enabled(), 404);

        $updates->check();

        return response()->json($updates->status());
    }

    public function install(AppUpdates $updates): JsonResponse
    {
        abort_unless($updates->enabled(), 404);

        $updates->install();

        return response()->json(['ok' => true]);
    }
}
