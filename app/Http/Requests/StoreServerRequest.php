<?php

namespace App\Http\Requests;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreServerRequest extends FormRequest
{
    /**
     * Env var the CLI reads a run-only API token from, per provider. Tokens
     * travel by environment so they never appear in the process list or on
     * the stored Run.
     */
    public const TOKEN_ENVIRONMENT = [
        'do' => 'TF_VAR_do_token',
        'hetzner' => 'HCLOUD_TOKEN',
    ];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (! $this->filled('target_kind')) {
            $this->merge(['target_kind' => 'vps']);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'provider' => ['required', Rule::in(['do', 'hetzner', 'gcp', 'aws', 'existing', 'custom'])],
            'stack_name' => ['required', 'string', 'max:40', 'regex:/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'],
            'region' => ['required_unless:provider,existing,custom', 'nullable', 'string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'size' => ['required_unless:provider,existing,custom', 'nullable', 'string', 'max:40', 'regex:/^[a-z0-9.-]+$/'],
            'ip' => ['required_if:provider,existing', 'required_if:provider,custom', 'nullable', 'ip'],
            'ssh_user' => ['nullable', 'string', 'max:50'],
            'ssh_key' => ['required_if:provider,existing', 'required_if:provider,custom', 'nullable', 'string', 'max:255'],
            'ssh_passphrase' => ['nullable', 'string'],
            // Not "kind" — that already means 'server'|'dev-box' on this same form.
            'target_kind' => ['required', Rule::in(['vps', 'managed'])],
            'node_count' => ['required_if:target_kind,managed', 'nullable', 'integer', 'min:1', 'max:20'],
            'ha' => ['nullable', 'boolean'],
            'k8s_version_prefix' => ['nullable', 'string', 'max:20', 'regex:/^[0-9.]+$/'],
            'api_token' => ['nullable', 'string', 'max:200'],
            'cloudflare_token' => ['nullable', 'string', 'max:200'],
            'dns_provider' => ['nullable', Rule::in(['cloudflare', 'route53', 'google'])],
            'enable_dns' => ['nullable', 'boolean'],
            'enable_tls' => ['nullable', 'boolean'],
            'dns_aws_access_key_id' => ['nullable', 'string', 'max:100'],
            'dns_aws_secret_access_key' => ['nullable', 'string', 'max:200'],
            'dns_aws_region' => ['nullable', 'string', 'max:50'],
            'dns_gcp_project_id' => ['nullable', 'string', 'max:100'],
            'dns_gcp_credentials' => ['nullable', 'string'],
            'aws_access_key_id' => ['nullable', 'string', 'max:100'],
            'aws_secret_access_key' => ['nullable', 'string', 'max:200'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'account' => ['nullable', 'string', 'max:100'],
            'ssh_port' => ['nullable', 'integer', 'between:1,65535'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            // Mirrors cloud:create's own guard (resolveTargetKind()) — Hetzner
            // has no managed-Kubernetes offering at all.
            if ($this->input('provider') === 'hetzner' && $this->input('target_kind') === 'managed') {
                $validator->errors()->add('target_kind', 'Hetzner Cloud does not offer a managed Kubernetes service.');
            }

            if ($this->filled('ssh_port')) {
                $port = $this->integer('ssh_port');
                if ($port === 443) {
                    $validator->errors()->add('ssh_port', 'Port 443 is reserved for Traefik HTTPS ingress on single-node VPS clusters.');
                } elseif ($port === 80) {
                    $validator->errors()->add('ssh_port', 'Port 80 is reserved for Traefik HTTP web ingress.');
                } elseif ($port === 2222) {
                    $validator->errors()->add('ssh_port', 'Port 2222 is reserved for Git (Forgejo) SSH service.');
                }
            }

            if ($this->filled('stack_name')) {
                $name = $this->string('stack_name')->toString();
                $alreadyRunning = Run::where('status', RunStatus::Running)
                    ->where('kind', RunKind::CreateServer)
                    ->where(fn ($q) => $q->where('subject', $name)->orWhere('server_name', $name)->orWhere('target_name', $name))
                    ->exists();

                if ($alreadyRunning) {
                    $validator->errors()->add('stack_name', "A server creation run for '{$name}' is already in progress.");
                }
            }
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'stack_name.regex' => 'Use lowercase letters, numbers, and dashes (e.g. my-first-server).',
        ];
    }

    /** Whether the person gave a Cloudflare token, so the new server gets DNS records and SSL set up. */
    public function connectsCloudflare(): bool
    {
        return trim((string) $this->input('cloudflare_token')) !== '';
    }

    public function dnsProvider(): ?string
    {
        if ($this->filled('dns_provider')) {
            return $this->string('dns_provider')->toString();
        }

        if ($this->connectsCloudflare()) {
            return 'cloudflare';
        }

        return null;
    }

    /**
     * @return array<string, string>
     */
    public function secretEnvironment(): array
    {
        $dnsEnv = [];
        $provider = $this->dnsProvider();

        if ($provider === 'cloudflare' && $this->connectsCloudflare()) {
            $dnsEnv['LARAKUBE_CLOUDFLARE_TOKEN'] = trim((string) $this->input('cloudflare_token'));
        } elseif ($provider === 'route53') {
            $key = trim((string) ($this->input('dns_aws_access_key_id') ?: $this->input('aws_access_key_id')));
            $secret = trim((string) ($this->input('dns_aws_secret_access_key') ?: $this->input('aws_secret_access_key')));
            $region = trim((string) ($this->input('dns_aws_region') ?: $this->input('region') ?: 'us-east-1'));

            if ($key !== '') {
                $dnsEnv['AWS_ACCESS_KEY_ID'] = $key;
            }
            if ($secret !== '') {
                $dnsEnv['AWS_SECRET_ACCESS_KEY'] = $secret;
            }
            if ($region !== '') {
                $dnsEnv['AWS_DEFAULT_REGION'] = $region;
            }
        } elseif ($provider === 'google') {
            $project = trim((string) ($this->input('dns_gcp_project_id') ?: $this->input('gcp_project')));
            $creds = trim((string) ($this->input('dns_gcp_credentials') ?: $this->input('gcp_credentials')));

            if ($project !== '') {
                $dnsEnv['GCP_PROJECT_ID'] = $project;
            }
            if ($creds !== '') {
                if (str_starts_with($creds, '{')) {
                    $dnsEnv['GCP_SERVICE_ACCOUNT_JSON'] = $creds;
                } else {
                    $dnsEnv['GOOGLE_APPLICATION_CREDENTIALS'] = $creds;
                }
            }
        }

        return $dnsEnv + $this->providerEnvironment();
    }

    /**
     * @return array<string, string>
     */
    private function providerEnvironment(): array
    {
        $provider = $this->string('provider')->toString();

        if ($provider === 'aws') {
            $env = [];
            $key = trim((string) $this->input('aws_access_key_id'));
            $secret = trim((string) $this->input('aws_secret_access_key'));
            $region = trim((string) $this->input('region'));

            if ($key !== '') {
                $env['AWS_ACCESS_KEY_ID'] = $key;
            }
            if ($secret !== '') {
                $env['AWS_SECRET_ACCESS_KEY'] = $secret;
            }
            if ($region !== '') {
                $env['AWS_DEFAULT_REGION'] = $region;
                $env['AWS_REGION'] = $region;
            }

            return $env;
        }

        $variable = self::TOKEN_ENVIRONMENT[$provider] ?? null;
        $token = trim((string) $this->input('api_token'));

        return $variable !== null && $token !== '' ? [$variable => $token] : [];
    }
}
