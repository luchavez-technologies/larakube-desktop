<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Shared by Connect a domain (tool:init --tool=external-dns) and Automatic SSL certificates (tls:init). */
class CloudflareStepRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $provider = $this->dnsProvider();
        $isDns = $this->routeIs('servers.dns');
        $reusingStored = $this->boolean('reuse_stored');

        return [
            'dns_provider' => ['nullable', 'string', Rule::in(['cloudflare', 'route53', 'google'])],
            'enable_dns' => ['nullable', 'boolean'],
            'enable_tls' => ['nullable', 'boolean'],
            'cloudflare_token' => [
                $provider === 'cloudflare' && $isDns && ! $reusingStored ? 'required' : 'nullable',
                'string',
                'max:200',
            ],
            'group' => ['nullable', 'string', 'max:63', 'regex:/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'],
            'aws_access_key_id' => [
                $provider === 'route53' && ! $reusingStored && ! $this->filled('dns_aws_access_key_id') ? 'required' : 'nullable',
                'string',
                'max:100',
            ],
            'aws_secret_access_key' => [
                $provider === 'route53' && ! $reusingStored && ! $this->filled('dns_aws_secret_access_key') ? 'required' : 'nullable',
                'string',
                'max:200',
            ],
            'aws_region' => ['nullable', 'string', 'max:50'],
            'dns_aws_access_key_id' => ['nullable', 'string', 'max:100'],
            'dns_aws_secret_access_key' => ['nullable', 'string', 'max:200'],
            'dns_aws_region' => ['nullable', 'string', 'max:50'],
            'gcp_project_id' => [
                $provider === 'google' && ! $reusingStored && ! $this->filled('dns_gcp_project_id') ? 'required' : 'nullable',
                'string',
                'max:100',
            ],
            'gcp_credentials' => [
                $provider === 'google' && ! $reusingStored && ! $this->filled('dns_gcp_credentials') ? 'required' : 'nullable',
                'string',
            ],
            'dns_gcp_project_id' => ['nullable', 'string', 'max:100'],
            'dns_gcp_credentials' => ['nullable', 'string'],
            'reuse_stored' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'cloudflare_token.required' => 'Paste a Cloudflare API token.',
            'aws_access_key_id.required' => 'Provide an AWS Access Key ID.',
            'aws_secret_access_key.required' => 'Provide an AWS Secret Access Key.',
            'gcp_project_id.required' => 'Provide a Google Cloud Project ID.',
            'gcp_credentials.required' => 'Provide Google Cloud Service Account credentials JSON.',
            'group.regex' => 'Use lowercase letters, numbers and dashes.',
        ];
    }

    public function dnsProvider(): string
    {
        $provider = (string) $this->input('dns_provider');

        return in_array($provider, ['cloudflare', 'route53', 'google'], true) ? $provider : 'cloudflare';
    }

    /**
     * @return list<string>
     */
    public function providerArgument(): array
    {
        return $this->filled('dns_provider') ? ["--provider={$this->dnsProvider()}"] : [];
    }

    /**
     * @return list<string>
     */
    public function groupArgument(): array
    {
        $group = trim((string) $this->input('group'));

        return $group === '' ? [] : ["--group={$group}"];
    }

    /**
     * The credentials travel by environment variable (external-dns's init and tls:init both
     * read it), never on the command line.
     *
     * @return array<string, string>
     */
    public function secretEnvironment(): array
    {
        if ($this->boolean('reuse_stored')) {
            return [];
        }

        $provider = $this->dnsProvider();

        if ($provider === 'cloudflare') {
            $token = trim((string) $this->input('cloudflare_token'));

            return $token === '' ? [] : ['LARAKUBE_CLOUDFLARE_TOKEN' => $token];
        }

        if ($provider === 'route53') {
            $env = [];
            $key = trim((string) ($this->input('aws_access_key_id') ?: $this->input('dns_aws_access_key_id')));
            $secret = trim((string) ($this->input('aws_secret_access_key') ?: $this->input('dns_aws_secret_access_key')));
            $region = trim((string) ($this->input('aws_region') ?: $this->input('dns_aws_region') ?: 'us-east-1'));

            if ($key !== '') {
                $env['AWS_ACCESS_KEY_ID'] = $key;
            }
            if ($secret !== '') {
                $env['AWS_SECRET_ACCESS_KEY'] = $secret;
            }
            if ($region !== '') {
                $env['AWS_DEFAULT_REGION'] = $region;
            }

            return $env;
        }

        if ($provider === 'google') {
            $env = [];
            $project = trim((string) ($this->input('gcp_project_id') ?: $this->input('dns_gcp_project_id')));
            $creds = trim((string) ($this->input('gcp_credentials') ?: $this->input('dns_gcp_credentials')));

            if ($project !== '') {
                $env['GCP_PROJECT_ID'] = $project;
            }
            if ($creds !== '') {
                if (str_starts_with($creds, '{')) {
                    $env['GCP_SERVICE_ACCOUNT_JSON'] = $creds;
                } else {
                    $env['GOOGLE_APPLICATION_CREDENTIALS'] = $creds;
                }
            }

            return $env;
        }

        return [];
    }
}
