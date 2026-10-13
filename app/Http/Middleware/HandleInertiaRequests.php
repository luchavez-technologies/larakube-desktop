<?php

namespace App\Http\Middleware;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolMaturity;
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
            // Every run still going, not just the latest — the floating HUD
            // stacks one card per run, so a long EKS create doesn't crowd out
            // something started after it (ADR: multiple concurrent runs).
            'activeRuns' => fn () => Run::query()
                ->where('status', RunStatus::Running)
                ->latest('id')
                ->limit(10)
                ->get(['id', 'label', 'status', 'created_at']),
            'auth' => [
                'user' => $request->user(),
            ],
        ];
    }

    /**
     * Define props shared once and remembered across navigations.
     *
     * @return array<string, callable>
     */
    public function shareOnce(Request $request): array
    {
        return [
            'name' => fn () => config('app.name'),
            'theme' => fn () => rescue(fn () => app(GlobalSettings::class)->getTheme(), 'system', report: false),
            'hideProjects' => fn () => app(GlobalSettings::class)->hideProjects(),
            'experimental' => fn () => app(GlobalSettings::class)->experimental(),
            'demoMode' => fn () => app(GlobalSettings::class)->demoMode(),
            'untested' => fn () => app(ToolMaturity::class)->untested(),
        ];
    }
}
