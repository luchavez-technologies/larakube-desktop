<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\DesktopUninstaller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UninstallController extends Controller
{
    public function execute(Request $request, DesktopUninstaller $uninstaller): JsonResponse
    {
        $validated = $request->validate([
            'removeCli' => 'required|boolean',
            'removeShellPath' => 'required|boolean',
            'purgeClusterData' => 'required|boolean',
            'removeWsl' => 'required|boolean',
            'purgeAppData' => 'required|boolean',
            'trashAppBundle' => 'required|boolean',
        ]);

        $result = $uninstaller->execute($validated);

        if (! app()->runningUnitTests()) {
            dispatch(function () use ($uninstaller) {
                usleep(500000); // 500ms delay to allow JSON response to reach frontend
                $uninstaller->finishAndQuit();
            })->afterResponse();
        }

        return response()->json($result);
    }
}
