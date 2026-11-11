<?php

namespace App\Http\Requests\Mail;

use App\Http\Requests\SanitizingFormRequest;
use Illuminate\Contracts\Validation\ValidationRule;

class DeployMailRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeDomainField('domain');
        $this->sanitizeEmailField('admin_email');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'domain' => ['nullable', 'string', 'max:253', 'regex:'.self::HOSTNAME_REGEX],
            'admin_email' => ['nullable', 'string', 'email', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'domain.regex' => 'Enter a valid mail domain like mail.example.com.',
        ];
    }
}
