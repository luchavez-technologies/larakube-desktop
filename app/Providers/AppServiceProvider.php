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
        $this->configureNativeSqlite();

        $this->app->make(AppUpdates::class)->listen();
    }

    /**
     * NativePHP's runtime `nativephp` SQLite connection omits WAL and busy_timeout,
     * causing `database is locked` errors when web workers, queues, and scheduler overlap.
     *
     * Transactions are IMMEDIATE: the database queue reserves a job by reading
     * then writing inside one transaction, and a DEFERRED transaction that has to
     * upgrade from read to write fails at once with `database is locked` when
     * another process wrote first; busy_timeout can't help with that upgrade.
     * IMMEDIATE takes the write lock at BEGIN, where busy_timeout does wait.
     */
    protected function configureNativeSqlite(): void
    {
        $this->app->booted(function (): void {
            if (! is_array(config('database.connections.nativephp'))) {
                return;
            }

            config([
                'database.connections.nativephp.busy_timeout' => 10000,
                'database.connections.nativephp.journal_mode' => 'WAL',
                'database.connections.nativephp.synchronous' => 'NORMAL',
                'database.connections.nativephp.transaction_mode' => 'IMMEDIATE',
            ]);

            DB::purge('nativephp');
        });
    }

    /**
     * Which tools, frameworks, and features are still being battle-tested —
     * editorial calls the LaraKube team updates by shipping a new app
     * version, never per-user. See `ToolMaturity` for how these are read.
     */
    protected function configureMaturityFlags(): void
    {
        Feature::define('untested-tools', fn () => ['metabase', 'glitchtip', 'chatwoot', 'planka']);

        Feature::define('untested-frameworks', fn () => ['wordpress', 'django', 'fastapi', 'springboot', 'dotnet', 'gin', 'axum', 'nestjs', 'adonisjs']);

        Feature::define('untested-capabilities', fn () => ['dev-boxes', 'vps-to-managed', 'backups', 'mail', 'drive']);

        Feature::define('untested-dns-providers', fn () => ['route53', 'google']);
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
