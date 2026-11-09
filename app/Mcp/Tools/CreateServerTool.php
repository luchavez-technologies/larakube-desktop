<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\CloudProvider;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Sleep;
use Illuminate\Support\Str;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;

#[Name('create-server')]
#[Title('Create Server')]
#[Description('Provisions a new cloud server or managed cluster (GCP, DigitalOcean, Hetzner, AWS) via LaraKube.')]
class CreateServerTool extends Tool
{
    private const int POLL_TIMEOUT_SECONDS = 120;

    public function handle(Request $request): Response
    {
        $provider = (string) $request->get('provider');
        $stackName = trim((string) $request->get('stack_name'));
        $targetKind = (string) $request->get('target_kind', 'vps');
        $region = (string) $request->get('region');
        $size = (string) $request->get('size');
        $account = trim((string) $request->get('account'));
        $nodeCount = $request->get('node_count') !== null ? (int) $request->get('node_count') : 1;
        $ha = (bool) $request->get('ha', false);
        $dnsProvider = (string) $request->get('dns_provider');

        // Custom VPS specific parameters
        $ip = (string) $request->get('ip');
        $sshUser = (string) $request->get('ssh_user', 'root');
        $sshKey = (string) $request->get('ssh_key');
        $sshPort = $request->get('ssh_port') !== null ? (int) $request->get('ssh_port') : 22;

        if ($stackName === '') {
            return Response::error('A stack_name is required (e.g. "my-first-server").');
        }

        if (! preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/', $stackName) || strlen($stackName) > 40) {
            return Response::error("Invalid stack_name '{$stackName}'. Use lowercase letters, numbers, and dashes (max 40 chars).");
        }

        $alreadyRunning = Run::where('status', RunStatus::Running)
            ->where('kind', RunKind::CreateServer)
            ->where(fn ($q) => $q->where('subject', $stackName)->orWhere('server_name', $stackName)->orWhere('target_name', $stackName))
            ->exists();

        if ($alreadyRunning) {
            return Response::error("A server creation run for '{$stackName}' is already in progress.");
        }

        $catalog = app(ReadinessCheck::class)->providerCatalog($provider);
        $providerModel = CloudProvider::where('slug', $provider)->first();

        if ($provider === 'custom' || $provider === 'existing') {
            if ($ip === '' || $sshKey === '') {
                return Response::error("Both 'ip' and 'ssh_key' are required when provider is 'custom'.");
            }

            $arguments = [
                'cloud:init',
                $ip,
                "--ssh-user={$sshUser}",
                "--ssh-key={$sshKey}",
                "--stack-name={$stackName}",
                '--json',
            ];

            if ($sshPort > 0 && $sshPort !== 22) {
                $arguments[] = "--ssh-port={$sshPort}";
            }

            if ($dnsProvider === 'cloudflare') {
                $arguments[] = '--cloudflare';
            } elseif ($dnsProvider !== '') {
                $arguments[] = "--dns-provider={$dnsProvider}";
            }

            $run = app(CliRunner::class)->start(
                label: "Initialize server {$stackName}",
                arguments: $arguments,
                kind: RunKind::CreateServer,
                subject: $stackName,
                meta: ['targetKind' => 'vps', 'provider' => $provider],
                targetType: 'server',
                targetName: $stackName,
                serverName: $stackName,
            );

            Server::updateOrCreate(
                ['name' => $stackName],
                [
                    'provider' => 'custom',
                    'kind' => 'vps',
                    'ip' => $ip,
                    'port' => $sshPort,
                    'ssh_key' => $sshKey,
                    'context' => "larakube-{$ip}",
                    'status' => 'provisioning',
                ]
            );

            return $this->pollServerRun($run, $stackName, $provider, 'vps');
        }

        if ($provider === 'hetzner' && $targetKind === 'managed') {
            return Response::error('Hetzner Cloud does not offer a managed Kubernetes service. Use target_kind: "vps".');
        }

        // Resolve smart defaults for region and size if omitted
        if ($region === '') {
            $region = (string) ($catalog['defaultRegion'] ?? $providerModel?->default_region ?? '');
        }

        if ($size === '') {
            $size = (string) ($targetKind === 'managed'
                ? ($catalog['defaultManagedSize'] ?? $providerModel?->default_managed_size ?? $catalog['defaultSize'] ?? $providerModel?->default_vps_size ?? '')
                : ($catalog['defaultSize'] ?? $providerModel?->default_vps_size ?? ''));
        }

        if ($account === '' && $providerModel?->active_account) {
            $account = (string) $providerModel->active_account;
        }

        $accountArg = match ($provider) {
            'aws' => $account !== '' ? ["--aws-profile={$account}"] : [],
            'gcp' => $account !== '' ? ["--gcp-account={$account}"] : [],
            'do' => $account !== '' ? ["--do-account={$account}"] : [],
            'hetzner' => $account !== '' ? ["--hetzner-account={$account}"] : [],
            default => [],
        };

        $kindArg = $targetKind === 'managed'
            ? [
                '--managed',
                "--node-count={$nodeCount}",
                ...($ha ? ['--ha'] : []),
            ]
            : ['--vps'];

        $dnsArgs = [];
        if ($dnsProvider === 'cloudflare') {
            $dnsArgs[] = '--cloudflare';
        } elseif ($dnsProvider !== '') {
            $dnsArgs[] = "--dns-provider={$dnsProvider}";
        }

        $arguments = [
            'cloud:create',
            "--provider={$provider}",
            ...$kindArg,
            "--stack-name={$stackName}",
            "--region={$region}",
            "--size={$size}",
            '--json',
            ...$accountArg,
            ...$dnsArgs,
        ];

        $run = app(CliRunner::class)->start(
            label: $targetKind === 'managed' ? "Create managed cluster {$stackName}" : "Create server {$stackName}",
            arguments: $arguments,
            kind: RunKind::CreateServer,
            subject: $stackName,
            meta: ['targetKind' => $targetKind, 'provider' => $provider],
            targetType: 'server',
            targetName: $stackName,
            serverName: $stackName,
        );

        Server::updateOrCreate(
            ['name' => $stackName],
            [
                'provider' => $provider,
                'kind' => $targetKind,
                'region' => $region ?: null,
                'size' => $size ?: null,
                'account' => $account ?: null,
                'status' => 'provisioning',
            ]
        );

        return $this->pollServerRun($run, $stackName, $provider, $targetKind);
    }

    private function pollServerRun(Run $run, string $stackName, string $provider, string $targetKind): Response
    {
        $deadline = now()->addSeconds(self::POLL_TIMEOUT_SECONDS);

        while (now()->lessThan($deadline)) {
            $run->refresh();

            if ($run->status->isFinished()) {
                if ($run->status === RunStatus::Succeeded) {
                    $server = Server::where('name', $stackName)->first() ?? app(StackCatalog::class)->find($stackName);

                    return Response::text(json_encode([
                        'status' => 'ready',
                        'server' => $stackName,
                        'provider' => $provider,
                        'kind' => $targetKind,
                        'context' => $server?->context ?? ($server['context'] ?? "larakube-{$stackName}"),
                        'ip' => $server?->ip ?? ($server['ip'] ?? null),
                        'run_id' => $run->id,
                        'output' => Str::limit($run->output, 4000),
                    ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
                }

                return Response::error("Server creation failed for '{$stackName}': ".Str::limit($run->output, 2000));
            }

            Sleep::sleep(1);
        }

        return Response::text(json_encode([
            'status' => 'provisioning',
            'run_id' => $run->id,
            'server' => $stackName,
            'provider' => $provider,
            'kind' => $targetKind,
            'message' => "Server '{$stackName}' provisioning is in progress on {$provider}. Cloud provisioning typically takes 2-4 minutes. Call get-run-status with run_id {$run->id} to monitor until ready.",
        ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'provider' => $schema->string()->description('The cloud provider (gcp, do, hetzner, aws, custom)'),
            'stack_name' => $schema->string()->description('Unique name for the server/stack (e.g. gcp-prod)'),
            'target_kind' => $schema->string()->enum(['vps', 'managed'])->description('Server target kind: "vps" (single-node VM) or "managed" (GKE/DOKS/EKS cluster). Default: vps')->nullable(),
            'region' => $schema->string()->description('Region to deploy to (optional; defaults to provider default)')->nullable(),
            'size' => $schema->string()->description('Machine size/type (optional; defaults to provider default)')->nullable(),
            'account' => $schema->string()->description('Configured cloud account/profile (optional; defaults to active account)')->nullable(),
            'node_count' => $schema->integer()->description('Number of worker nodes if target_kind is "managed" (default: 1)')->nullable(),
            'ha' => $schema->boolean()->description('Whether to enable High Availability for managed control plane (default: false)')->nullable(),
            'dns_provider' => $schema->string()->description('DNS provider (e.g. cloudflare, google, route53) (optional)')->nullable(),
            'ip' => $schema->string()->description('IP address for custom/existing VPS (required only if provider is custom)')->nullable(),
            'ssh_user' => $schema->string()->description('SSH user for custom VPS (default: root)')->nullable(),
            'ssh_key' => $schema->string()->description('SSH private key path or key name for custom VPS')->nullable(),
            'ssh_port' => $schema->integer()->description('SSH port for custom VPS (default: 22)')->nullable(),
        ];
    }
}
