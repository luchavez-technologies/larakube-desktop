<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shared FormRequest base providing consistent input sanitation (trim, lowercase,
 * URL/trailing-dot normalization) and canonical hostname validation rules.
 */
abstract class SanitizingFormRequest extends FormRequest
{
    public const string HOSTNAME_REGEX = '/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/';

    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalize email addresses (trimmed & lowercased) when present.
     */
    protected function sanitizeEmailField(string $key): void
    {
        $value = $this->input($key);
        if (! is_string($value)) {
            return;
        }

        $trimmed = trim(strtolower($value));
        $this->merge([$key => $trimmed === '' ? null : $trimmed]);
    }

    /**
     * Normalize hostnames/domains (trim whitespace, lowercase, and drop trailing dot).
     * Intentionally preserves URL schemes or paths so regex validation can reject them
     * with an actionable message.
     */
    protected function sanitizeDomainField(string $key): void
    {
        $value = $this->input($key);
        if (! is_string($value)) {
            return;
        }

        $cleaned = rtrim(trim(strtolower($value)), '.');

        $this->merge([$key => $cleaned === '' ? null : $cleaned]);
    }

    /**
     * Trim arbitrary string fields without changing case (e.g. names, tokens, regions).
     */
    protected function sanitizeTrimmedField(string $key, bool $lowercase = false): void
    {
        $value = $this->input($key);
        if (! is_string($value)) {
            return;
        }

        $cleaned = trim($value);
        if ($lowercase) {
            $cleaned = strtolower($cleaned);
        }

        $this->merge([$key => $cleaned === '' ? null : $cleaned]);
    }
}
