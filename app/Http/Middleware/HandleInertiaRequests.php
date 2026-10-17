<?php

namespace App\Http\Middleware;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\User;
use App\Notifications\RunFinishedNotification;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolMaturity;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
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
            'activeRuns' => fn () => rescue(fn () => Run::query()
                ->where('status', RunStatus::Running)
                ->latest('id')
                ->limit(10)
                ->get(['id', 'label', 'status', 'created_at']), collect(), report: false),
            'recentRuns' => fn () => rescue(fn () => Run::query()
                ->latest('id')
                ->limit(5)
                ->get(['id', 'label', 'status', 'kind', 'created_at', 'finished_at']), collect(), report: false),
            'notifications' => function () {
                $this->ensureNotificationsSeeded();
                $user = rescue(fn () => User::defaultUser(), null, report: false);

                if (! $user) {
                    return [
                        'unreadCount' => 0,
                        'items' => [],
                    ];
                }

                return [
                    'unreadCount' => rescue(fn () => $user->unreadNotifications()->count(), 0, report: false),
                    'items' => rescue(fn () => $user->notifications()->latest()->limit(15)->get()->map(fn (DatabaseNotification $n) => [
                        'id' => $n->id,
                        'type' => $n->type,
                        'data' => $n->data,
                        'read_at' => $n->read_at?->toIso8601String(),
                        'created_at' => $n->created_at?->toIso8601String(),
                    ]), [], report: false),
                ];
            },
            'auth' => [
                'user' => $request->user(),
            ],
        ];
    }

    protected function ensureNotificationsSeeded(): void
    {
        rescue(function () {
            $user = User::defaultUser();
            if ($user->notifications()->count() === 0) {
                $runs = Run::query()
                    ->whereIn('status', [RunStatus::Succeeded, RunStatus::Failed])
                    ->latest('id')
                    ->limit(5)
                    ->get();

                foreach ($runs as $run) {
                    $user->notify(new RunFinishedNotification($run));
                }
            }
        }, report: false);
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
            'versions' => fn () => rescue(function () {
                $cliRaw = app(ReadinessCheck::class)->status('larakube')['version'] ?? null;
                $cliClean = null;
                if ($cliRaw) {
                    $cliClean = trim((string) preg_replace('/^LaraKube\s+/i', '', $cliRaw));
                    if (preg_match('/^[a-f0-9]{40}$/i', $cliClean)) {
                        $cliClean = substr($cliClean, 0, 7);
                    }
                }

                return [
                    'desktop' => (string) config('nativephp.version', '1.0.0'),
                    'cli' => $cliClean,
                ];
            }, [
                'desktop' => (string) config('nativephp.version', '1.0.0'),
                'cli' => null,
            ], report: false),
        ];
    }
}
