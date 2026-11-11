<?php

namespace App\Http\Requests\Mail;

use App\Http\Requests\SanitizingFormRequest;
use Illuminate\Contracts\Validation\ValidationRule;

class ConfigureMailRelayRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeTrimmedField('provider', lowercase: true);
        $this->sanitizeTrimmedField('username');
        $this->sanitizeTrimmedField('api_key');
        $this->sanitizeTrimmedField('region', lowercase: true);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'provider' => ['required', 'string', 'in:brevo,ses,remove'],
            'username' => ['nullable', 'string', 'max:255'],
            'api_key' => ['nullable', 'string', 'max:512'],
            'region' => ['nullable', 'string', 'max:64'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
        ];
    }
}
