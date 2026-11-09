<?php

use App\Mcp\Prompts\DiagnoseClusterPrompt;
use App\Mcp\Prompts\NewServerWizardPrompt;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Models\Server;

test('prompts list registers diagnose-cluster and new-server-wizard', function (): void {
    $prompts = LaraKubeDesktopServer::prompts();

    $prompts->assertRegistered([
        DiagnoseClusterPrompt::class,
        NewServerWizardPrompt::class,
    ]);
});

test('diagnose-cluster prompt returns diagnostic instructions', function (): void {
    $response = LaraKubeDesktopServer::prompt(DiagnoseClusterPrompt::class, [
        'server' => 'production-cluster',
    ]);

    $response->assertOk()
        ->assertSee("server 'production-cluster'")
        ->assertSee('list-cluster-tools')
        ->assertSee('get-run-status');
});

test('new-server-wizard prompt returns cloud provisioning guidance', function (): void {
    $response = LaraKubeDesktopServer::prompt(NewServerWizardPrompt::class, [
        'provider' => 'gcp',
    ]);

    $response->assertOk()
        ->assertSee("The user expressed interest in 'gcp'")
        ->assertSee('Google Cloud Platform (GCP)')
        ->assertSee('create-server');
});

test('prompts support autocompletions for their arguments', function (): void {
    Server::updateOrCreate(
        ['name' => 'prod-k8s-us'],
        ['ip' => '10.0.0.1', 'context' => 'prod-ctx', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']
    );

    // Prompt server completion
    $serverComp = LaraKubeDesktopServer::completion(DiagnoseClusterPrompt::class, 'server', 'prod');
    $serverComp->assertOk()
        ->assertHasCompletions(['prod-k8s-us']);

    // Prompt provider completion
    $providerComp = LaraKubeDesktopServer::completion(NewServerWizardPrompt::class, 'provider', 'gc');
    $providerComp->assertOk()
        ->assertHasCompletions(['gcp']);
});
