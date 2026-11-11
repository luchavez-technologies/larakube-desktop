<?php

namespace App\Http\Requests\Mail;

use App\Http\Requests\SanitizingFormRequest;
use Illuminate\Contracts\Validation\ValidationRule;

class DestroyMailDomainRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeDomainField('domain');
        $this->sanitizeDomainField('confirm');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $confirmRules = ['required', 'string', 'max:253'];
        if ($this->header('X-Inertia') || $this->isPrecognitive()) {
            $confirmRules[] = 'same:domain';
        }

        return [
            'domain' => ['required', 'string', 'max:253', 'regex:'.self::HOSTNAME_REGEX],
            'confirm' => $confirmRules,
            'with_sso' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'domain.regex' => 'Enter a valid domain like example.com.',
            'confirm.same' => 'Type the exact domain name to confirm removal.',
        ];
    }
}
