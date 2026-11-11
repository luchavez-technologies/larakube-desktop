<?php

namespace App\Http\Requests\Mail;

use App\Http\Requests\SanitizingFormRequest;
use Illuminate\Contracts\Validation\ValidationRule;

class DeleteMailAccountRequest extends SanitizingFormRequest
{
    protected function prepareForValidation(): void
    {
        $this->sanitizeEmailField('email');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
        ];
    }
}
