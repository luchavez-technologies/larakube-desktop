<?php

use App\Services\LaraKube\ToolMaturity;
use Inertia\Testing\AssertableInertia;
use Laravel\Pennant\Feature;

test('ToolMaturity reports the tools, frameworks, and capabilities still being tested', function () {
    $untested = app(ToolMaturity::class)->untested();

    expect($untested['tools'])->toBe(['wordpress', 'metabase', 'glitchtip', 'chatwoot', 'planka'])
        ->and($untested['frameworks'])->toBe(['wordpress', 'django', 'fastapi', 'springboot', 'dotnet', 'gin', 'axum', 'nestjs', 'adonisjs'])
        ->and($untested['capabilities'])->toBe(['dev-boxes', 'vps-to-managed', 'backups']);
});

test('redefining a maturity feature changes what ToolMaturity reports, same as any other Pennant feature', function () {
    Feature::define('untested-tools', fn () => ['wordpress']);

    expect(app(ToolMaturity::class)->untested()['tools'])->toBe(['wordpress']);
});

test('the untested list is shared on every page, the same way hideProjects and experimental are', function () {
    $this->get(route('settings.show'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('untested.tools', ['wordpress', 'metabase', 'glitchtip', 'chatwoot', 'planka'])
            ->where('untested.frameworks', ['wordpress', 'django', 'fastapi', 'springboot', 'dotnet', 'gin', 'axum', 'nestjs', 'adonisjs'])
            ->where('untested.capabilities', ['dev-boxes', 'vps-to-managed', 'backups'])
        );
});
