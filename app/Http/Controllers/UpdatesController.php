<?php

namespace App\Http\Controllers;

use App\Services\AppUpdates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class UpdatesController extends Controller
{
    public function status(Request $request, AppUpdates $updates): JsonResponse|RedirectResponse
    {
        if (! $request->wantsJson()) {
            if ($updates->enabled()) {
                $updates->check();
            }

            return redirect('/settings?action=updates');
        }

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
