<?php

namespace App\Http\Requests\Mail;

use App\Http\Requests\SanitizingFormRequest;
use Illuminate\Contracts\Validation\ValidationRule;

class StoreMailAccountRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeEmailField('email');
        $this->sanitizeTrimmedField('name');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
            'quota' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'sso' => ['nullable', 'boolean'],
        ];
    }
}
