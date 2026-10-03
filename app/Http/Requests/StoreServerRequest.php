<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'provider' => ['required', Rule::in(['do', 'hetzner', 'gcp', 'aws'])],
            'stack_name' => ['required', 'string', 'max:40', 'regex:/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'],
            'region' => ['required', 'string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'size' => ['required', 'string', 'max:40', 'regex:/^[a-z0-9.-]+$/'],
            'api_token' => ['nullable', 'string', 'max:200'],
            'cloudflare_token' => ['nullable', 'string', 'max:200'],
            'aws_access_key_id' => ['nullable', 'string', 'max:100'],
            'aws_secret_access_key' => ['nullable', 'string', 'max:200'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
        ];
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

    /**
     * @return array<string, string>
     */
    public function secretEnvironment(): array
    {
        $cloudflare = $this->connectsCloudflare() ? ['LARAKUBE_CLOUDFLARE_TOKEN' => trim((string) $this->input('cloudflare_token'))] : [];

        return $cloudflare + $this->providerEnvironment();
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
