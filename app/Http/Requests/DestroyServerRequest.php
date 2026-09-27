<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class DestroyServerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Typing the exact server name is the confirmation.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'confirm' => ['required', 'string', 'in:'.$this->route('server')],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'confirm.in' => 'Type the server name exactly to confirm.',
        ];
    }
}
