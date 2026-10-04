<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Native\Desktop\Facades\Shell;

/** Opens a tool's address (or a local tunnel's) in the user's default browser, not inside the app window. */
class OpenExternalController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'url:http,https', 'max:500'],
        ]);

        // Plain http is only for a tunnel on this computer, such as a workspace editor.
        $parts = parse_url($validated['url']);
        abort_if(($parts['scheme'] ?? '') === 'http' && ! in_array($parts['host'] ?? '', ['127.0.0.1', 'localhost'], true), 422);

        Shell::openExternal($validated['url']);

        return back();
    }
}
