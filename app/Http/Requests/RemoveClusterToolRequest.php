<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RemoveClusterToolRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Typing the tool's slug is the confirmation.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'confirm' => ['required', 'string', 'in:'.$this->route('tool')],
            'instance' => ['nullable', 'string', 'max:120'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'confirm.in' => 'Type the tool name exactly to confirm.',
        ];
    }
}
