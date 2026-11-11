<?php

namespace App\Http\Requests\Mail;

use App\Http\Requests\SanitizingFormRequest;
use Illuminate\Contracts\Validation\ValidationRule;

class SendTestMailRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeEmailField('to');
        $this->sanitizeEmailField('from');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'to' => ['required', 'string', 'email', 'max:255'],
            'from' => ['nullable', 'string', 'email', 'max:255'],
            'password' => ['nullable', 'string', 'max:255'],
        ];
    }
}
