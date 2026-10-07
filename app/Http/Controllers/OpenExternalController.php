<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Native\Desktop\Facades\Shell;

/** Opens a tool's address (or a local tunnel's) in the user's default browser, not inside the app window. */
class OpenExternalController extends Controller
{
    public function __invoke(Request $request): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            // Sign-in addresses (Google's carries scopes and a code challenge) run past 500 characters.
            'url' => [
                'required',
                'string',
                'max:4096',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    $scheme = parse_url((string) $value, PHP_URL_SCHEME);
                    if (! in_array($scheme, ['http', 'https', 'vscode', 'cursor', 'jetbrains', 'jetbrains-gateway'], true)) {
                        $fail('The url field must be a valid URL.');
                    }
                },
            ],
        ]);

        // Plain http is only for a tunnel on this computer, such as a workspace editor.
        $parts = parse_url($validated['url']);
        abort_if(($parts['scheme'] ?? '') === 'http' && ! in_array($parts['host'] ?? '', ['127.0.0.1', 'localhost'], true), 422);

        Shell::openExternal($validated['url']);

        // A caller that keeps its own page state (a dialog) asks for JSON, so nothing about the page is reloaded.
        return $request->expectsJson() ? response()->json(['ok' => true]) : back();
    }
}
