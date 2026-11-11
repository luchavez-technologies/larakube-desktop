<?php

namespace App\Http\Requests\Mail;

use App\Http\Requests\SanitizingFormRequest;
use Illuminate\Contracts\Validation\ValidationRule;

class StoreMailDomainRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeDomainField('domain');
        $this->sanitizeTrimmedField('cloudflare_token');
        $this->sanitizeEmailField('acme_email');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'domain' => ['required', 'string', 'max:253', 'regex:'.self::HOSTNAME_REGEX],
            'cloudflare_token' => ['nullable', 'string', 'max:255'],
            'acme_email' => ['nullable', 'string', 'email', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'domain.regex' => 'Enter a valid domain like example.com, without https:// or a path.',
        ];
    }
}
