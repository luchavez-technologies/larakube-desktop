<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class QuickLaunchAppRequest extends FormRequest
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
            'tool' => ['required', 'string', 'max:64'],
            'server' => ['required', 'string', 'max:128'],
            'domain' => ['required', 'string', 'max:200', 'regex:/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/'],
            'admin_email' => ['nullable', 'string', 'email', 'max:255'],
            'database' => ['nullable', 'string', 'in:sqlite,mysql,mariadb,postgres,postgresql'],
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
