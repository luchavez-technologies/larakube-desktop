<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\LaraKube\DomainProbe;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DomainStatusController extends Controller
{
    public function show(Request $request, DomainProbe $probe): JsonResponse
    {
        $validated = $request->validate([
            'host' => ['required', 'string', 'max:253'],
        ]);

        return response()->json($probe->check((string) $validated['host']));
    }
}
