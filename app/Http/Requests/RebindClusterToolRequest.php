<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RebindClusterToolRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_host' => ['required', 'string', 'max:253'],
            'new_host' => ['required', 'string', 'max:253', 'different:current_host'],
            'wire_sso' => ['nullable', 'boolean'],
            'instance' => ['nullable', 'string', 'max:120'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'new_host.different' => 'The new host must be different from the current host.',
        ];
    }
}
