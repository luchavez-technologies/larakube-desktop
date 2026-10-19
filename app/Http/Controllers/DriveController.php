<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Server;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\DomainCatalog;
use App\Services\LaraKube\DriveStatus;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DriveController extends Controller
{
    public function __construct(private StackCatalog $stacks) {}

    /**
     * Entry route from sidebar: redirects to last browsed server or first ready server.
     */
    public function entry(CurrentServer $current): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $resolved = $current->resolve($names);

        return $resolved === null ? to_route('servers.index') : to_route('servers.drive.index', $resolved);
    }

    /**
     * Drive management overview for the selected server.
     */
    public function index(
        string $server,
        DriveStatus $status,
        CurrentServer $current,
        DomainCatalog $domains,
        GlobalSettings $settings,
    ): Response {
        $stack = $this->readyServer($server);
        $current->remember($server);

        $context = (string) $stack['context'];
        $isInstalled = $status->isInstalled($context);
        $servers = array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready'));

        $serverDomains = $domains->forContext($context) ?? [];
        $isLocal = Server::isStackLocal($stack);
        $localTld = $settings->getLocalTld();

        return Inertia::render('drive/index', [
            'server' => $stack,
            'servers' => $servers,
            'isInstalled' => $isInstalled,
            'domains' => $serverDomains,
            'isLocal' => $isLocal,
            'localTld' => $localTld,
            'serverInfo' => $isInstalled
                ? Inertia::defer(fn (): ?array => $status->serverInfo($context), 'serverInfo')
                : null,
            'extensions' => $isInstalled
                ? Inertia::defer(fn (): array => $status->extensions($context), 'extensions')
                : [],
            'driveSync' => $status->syncState($context),
        ]);
    }

    /**
     * Deploy ownCloud Infinite Scale (oCIS) Drive on the server.
     */
    public function deploy(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        $domain = $request->string('domain')->trim()->lower()->toString();
        $vpnOnly = $request->boolean('vpn_only');
        $enableOffice = $request->boolean('enable_office');
        $extensions = $request->input('extensions');
        if (! is_array($extensions)) {
            $extensions = [];
        }

        $args = ['tool:init', '--tool=ocis', 'production', "--context={$context}", '--force'];
        if ($domain !== '') {
            $args[] = "--domain={$domain}";
        }
        if ($vpnOnly) {
            $args[] = '--vpn-only';
        }
        if (! empty($extensions)) {
            $args[] = '--extensions='.implode(',', array_filter(array_map('trim', $extensions)));
        }

        $serverModel = Server::firstWhere('context', $context);
        $serverModel?->driveTool()?->update(['sync_status' => 'syncing']);

        $run = $runner->start(
            label: "Deploy ownCloud Drive on {$server}",
            arguments: $args,
            kind: RunKind::DriveDeploy,
            subject: $server,
            meta: [
                'server' => $server,
                'context' => $context,
                'tool' => 'ocis',
                'enable_office' => $enableOffice ? '1' : '0',
                'domain' => $domain,
                'vpn_only' => $vpnOnly ? '1' : '0',
            ],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Deploy Collabora Online (CODE) office suite for document editing.
     */
    public function deployOffice(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        $domain = $request->string('domain')->trim()->lower()->toString();
        $vpnOnly = $request->boolean('vpn_only');

        $serverModel = Server::firstWhere('context', $context);
        $knownDriveHost = $serverModel?->driveTool()?->data['driveInfo']['host'] ?? null;

        $args = ['drive:office:init', 'production', "--context={$context}", '--force'];
        if ($domain !== '') {
            $args[] = "--domain={$domain}";
        } elseif (is_string($knownDriveHost) && $knownDriveHost !== '') {
            $args[] = "--domain={$knownDriveHost}";
        }
        if ($vpnOnly) {
            $args[] = '--vpn-only';
        }

        $serverModel?->driveTool()?->update(['sync_status' => 'syncing']);

        $run = $runner->start(
            label: "Deploy Collabora Online on {$server}",
            arguments: $args,
            kind: RunKind::DriveOfficeDeploy,
            subject: $server,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Install a web extension into oCIS.
     */
    public function installExtension(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate(['extension' => ['required', 'string']]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $extension = $request->string('extension')->trim()->toString();

        $serverModel = Server::firstWhere('context', $context);
        $serverModel?->driveTool()?->update(['sync_status' => 'syncing']);

        $run = $runner->start(
            label: "Install {$extension} extension on {$server}",
            arguments: ['drive:ext:add', 'production', "--context={$context}", "--extension={$extension}"],
            kind: RunKind::DriveInstallExtension,
            subject: $extension,
            meta: ['server' => $server, 'context' => $context, 'extension' => $extension],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Uninstall a web extension from oCIS.
     */
    public function uninstallExtension(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate(['extension' => ['required', 'string']]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $extension = $request->string('extension')->trim()->toString();

        $serverModel = Server::firstWhere('context', $context);
        $serverModel?->driveTool()?->update(['sync_status' => 'syncing']);

        $run = $runner->start(
            label: "Uninstall {$extension} extension on {$server}",
            arguments: ['drive:ext:remove', 'production', "--context={$context}", "--extension={$extension}"],
            kind: RunKind::DriveUninstallExtension,
            subject: $extension,
            meta: ['server' => $server, 'context' => $context, 'extension' => $extension],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Restart / re-reconcile Drive deployment.
     */
    public function restart(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        $serverModel = Server::firstWhere('context', $context);
        $serverModel?->driveTool()?->update(['sync_status' => 'syncing']);

        $run = $runner->start(
            label: "Restart ownCloud Drive on {$server}",
            arguments: ['tool:init', '--tool=ocis', 'production', "--context={$context}", '--force'],
            kind: RunKind::DriveRestart,
            subject: $server,
            meta: ['server' => $server, 'context' => $context, 'tool' => 'ocis'],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Remove Drive from the cluster.
     */
    public function destroy(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        $serverModel = Server::firstWhere('context', $context);
        $serverModel?->driveTool()?->update(['sync_status' => 'syncing']);

        $args = ['ocis:remove', 'production', "--context={$context}", '--force'];
        if ($request->boolean('purge')) {
            $args[] = '--purge';
        }

        $run = $runner->start(
            label: "Remove ownCloud Drive from {$server}",
            arguments: $args,
            kind: RunKind::DriveRemove,
            subject: $server,
            meta: ['server' => $server, 'context' => $context, 'tool' => 'ocis'],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Resolve a server that is ready and has a valid Kubernetes context.
     *
     * @return array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, status: string, account?: ?string}
     */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        Server::syncFromStack($stack);

        /** @var array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, status: string, account?: ?string} $stack */
        return $stack;
    }
}
