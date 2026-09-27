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

    /**
     * @return array<string, string>
     */
    public function secretEnvironment(): array
    {
        $variable = self::TOKEN_ENVIRONMENT[$this->string('provider')->toString()] ?? null;
        $token = trim((string) $this->input('api_token'));

        return $variable !== null && $token !== '' ? [$variable => $token] : [];
    }
}
