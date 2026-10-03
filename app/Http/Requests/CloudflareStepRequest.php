<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

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
        return [
            'cloudflare_token' => [$this->routeIs('servers.dns') ? 'required' : 'nullable', 'string', 'max:200'],
            'group' => ['nullable', 'string', 'max:63', 'regex:/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'cloudflare_token.required' => 'Paste a Cloudflare API token.',
            'group.regex' => 'Use lowercase letters, numbers and dashes.',
        ];
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
     * The token travels by environment variable (external-dns's init and tls:init both
     * read it), never on the command line.
     *
     * @return array<string, string>
     */
    public function secretEnvironment(): array
    {
        $token = trim((string) $this->input('cloudflare_token'));

        return $token === '' ? [] : ['LARAKUBE_CLOUDFLARE_TOKEN' => $token];
    }
}
