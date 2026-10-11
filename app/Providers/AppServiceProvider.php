<?php

namespace App\Providers;

use App\Services\AppUpdates;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Laravel\Pennant\Feature;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureMaturityFlags();

        $this->app->make(AppUpdates::class)->listen();
    }

    /**
     * Which tools, frameworks, and features are still being battle-tested —
     * editorial calls the LaraKube team updates by shipping a new app
     * version, never per-user. See `ToolMaturity` for how these are read.
     */
    protected function configureMaturityFlags(): void
    {
        Feature::define('untested-tools', fn () => ['wordpress', 'metabase', 'glitchtip', 'chatwoot', 'planka']);

        Feature::define('untested-frameworks', fn () => ['wordpress', 'django', 'fastapi', 'springboot', 'dotnet', 'gin', 'axum', 'nestjs', 'adonisjs']);

        Feature::define('untested-capabilities', fn () => ['dev-boxes', 'vps-to-managed']);
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
