<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Native\Desktop\Facades\Shell;

/** Opens a tool's address in the user's default browser, not inside the app window. */
class OpenExternalController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'url:https', 'max:500'],
        ]);

        Shell::openExternal($validated['url']);

        return back();
    }
}
