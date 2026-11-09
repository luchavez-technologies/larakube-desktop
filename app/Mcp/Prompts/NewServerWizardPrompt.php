<?php

declare(strict_types=1);

namespace App\Mcp\Prompts;

use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Completions\CompletionResponse;
use Laravel\Mcp\Server\Contracts\Completable;
use Laravel\Mcp\Server\Prompt;
use Laravel\Mcp\Server\Prompts\Argument;

#[Name('new-server-wizard')]
#[Title('New Server Provisioning Wizard')]
#[Description('Guides the user interactively through choosing a cloud provider, sizing, region, and companion tools before provisioning.')]
class NewServerWizardPrompt extends Prompt implements Completable
{
    public function arguments(): array
    {
        return [
            new Argument(
                name: 'provider',
                description: 'Preferred cloud provider (gcp, do, hetzner, aws, custom)',
                required: false,
            ),
        ];
    }

    public function handle(Request $request): Response
    {
        $provider = trim((string) $request->get('provider'));
        $preferred = $provider !== '' ? "The user expressed interest in '{$provider}'." : 'The user has not selected a provider yet.';

        $prompt = <<<EOT
You are the LaraKube Cloud Architect.
Guide the user through provisioning a new Kubernetes server or cluster. {$preferred}

Help them determine:
1. Target Cloud Provider: Google Cloud Platform (GCP), DigitalOcean (DO), Hetzner Cloud, Amazon Web Services (AWS), or a BYO custom Ubuntu VPS.
2. Architecture & Workload Needs: A single-node VPS (cost-effective k3s) vs. a multi-node managed cluster (DOKS/GKE/EKS) with HA control plane.
3. Region & Machine Size: Recommend balanced defaults (e.g. e2-standard-4 for GCP, s-4vcpu-8gb for DigitalOcean, cpx31 for Hetzner).
4. Desired Companion Tools: Inquire if they need workflow tools (n8n), CMS (WordPress), databases (PocketBase), email (Stalwart), or secrets vault (Vaultwarden).
5. Domain & DNS Automation: Inquire if they wish to configure automated DNS and SSL (e.g. Cloudflare ExternalDNS). Advise them they can set LARAKUBE_CLOUDFLARE_TOKEN in their shell environment or in LaraKube Desktop so they never have to paste sensitive API tokens directly into chat.
6. Seamless Tool Domain Chaining: When installing companion tools, check available domains via Cloudflare MCP (e.g. list_zones) or LaraKube's show-server domains. Proactively propose a concrete FQDN like `<tool>.<domain>` (e.g. `n8n.yourdomain.com`) instead of asking open-ended placeholder questions. ExternalDNS will automatically bind the DNS record in Cloudflare and issue SSL certificates via Traefik.
7. Once aligned, call `create-server` with their chosen parameters, followed by `connect-domain` and `install-cluster-tool` for any companion tools requested.
EOT;

        return Response::text($prompt);
    }

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'provider') {
            return CompletionResponse::match(['gcp', 'do', 'hetzner', 'aws', 'custom']);
        }

        return CompletionResponse::empty();
    }
}
