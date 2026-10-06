<?php

namespace App\Http\Middleware;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\GlobalSettings;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'theme' => fn () => rescue(fn () => app(GlobalSettings::class)->getTheme(), 'system', report: false),
            'hideProjects' => app(GlobalSettings::class)->hideProjects(),
            'experimental' => app(GlobalSettings::class)->experimental(),
            'activeRun' => fn () => Run::query()
                ->where('status', RunStatus::Running)
                ->latest('id')
                ->first(['id', 'label', 'status', 'created_at']),
            'auth' => [
                'user' => $request->user(),
            ],
        ];
    }
}
