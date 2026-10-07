<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\CloudAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class CloudAccountController extends Controller
{
    public function setDefault(Request $request, CloudAccount $account): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:do,hetzner,aws,gcp'],
            'account_id' => ['required', 'string'],
        ]);

        $result = $account->call([
            'cloud:accounts',
            "--provider={$validated['provider']}",
            "--set-default={$validated['account_id']}",
        ]);

        $success = ($result['success'] ?? false) === true;

        if ($request->expectsJson()) {
            return response()->json([
                'ok' => $success,
                'message' => $success ? "Default {$validated['provider']} account updated." : ($result['error'] ?? 'Could not switch account.'),
            ], $success ? 200 : 422);
        }

        return $success
            ? back()->with('success', "Default {$validated['provider']} account updated.")
            : back()->withErrors(['account' => (string) ($result['error'] ?? 'Could not switch account.')]);
    }

    public function add(Request $request, CloudAccount $account): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:do,hetzner'],
            'name' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9._ -]+$/'],
            'token' => ['required', 'string', 'min:10'],
        ]);

        $result = $account->call([
            'cloud:accounts',
            "--provider={$validated['provider']}",
            "--name={$validated['name']}",
            "--token={$validated['token']}",
            '--add',
        ]);

        $success = ($result['success'] ?? false) === true;

        if ($request->expectsJson()) {
            return response()->json([
                'ok' => $success,
                'message' => $success ? "Added account {$validated['name']}." : ($result['error'] ?? 'Could not add account.'),
            ], $success ? 200 : 422);
        }

        return $success
            ? back()->with('success', "Added account {$validated['name']}.")
            : back()->withErrors(['account' => (string) ($result['error'] ?? 'Could not add account.')]);
    }

    public function remove(Request $request, CloudAccount $account): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:do,hetzner,aws,gcp'],
            'account_id' => ['required', 'string'],
        ]);

        $result = $account->call([
            'cloud:accounts',
            "--provider={$validated['provider']}",
            "--remove={$validated['account_id']}",
        ]);

        $success = ($result['success'] ?? false) === true;

        if ($request->expectsJson()) {
            return response()->json([
                'ok' => $success,
                'message' => $success ? 'Account removed.' : ($result['error'] ?? 'Could not remove account.'),
            ], $success ? 200 : 422);
        }

        return $success
            ? back()->with('success', 'Account removed.')
            : back()->withErrors(['account' => (string) ($result['error'] ?? 'Could not remove account.')]);
    }
}
