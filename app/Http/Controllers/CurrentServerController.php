<?php

namespace App\Http\Controllers;

use App\Models\Server;
use App\Services\CurrentServer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Remembers the server picked in the sidebar, for pages that aren't about one server. */
class CurrentServerController extends Controller
{
    public function update(Request $request, CurrentServer $current): RedirectResponse
    {
        $ready = Server::query()->pickable()->pluck('name')->all();

        $validated = $request->validate(['server' => ['required', 'string', Rule::in($ready)]]);
        $current->remember($validated['server']);

        return back();
    }
}
