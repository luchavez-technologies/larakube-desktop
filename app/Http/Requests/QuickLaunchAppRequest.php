<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;

class QuickLaunchAppRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeTrimmedField('tool', lowercase: true);
        $this->sanitizeTrimmedField('server');
        $this->sanitizeDomainField('domain');
        $this->sanitizeEmailField('admin_email');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'tool' => ['required', 'string', 'max:64'],
            'server' => ['required', 'string', 'max:128'],
            'domain' => ['required', 'string', 'max:200', 'regex:'.self::HOSTNAME_REGEX],
            'admin_email' => ['nullable', 'string', 'email', 'max:255'],
            'wire_sso' => ['boolean'],
            'wire_mail' => ['boolean'],
            'options' => ['array'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'domain.regex' => 'Enter a domain like app.example.com, without https:// or a path.',
        ];
    }
}
