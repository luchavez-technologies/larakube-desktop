<?php

namespace App\Services\LaraKube;

/**
 * The Laravel questions an existing app's setup asks, taken from the CLI's
 * framework catalog: its choices (not the app name or email, which setup
 * collects itself) with the defaults the CLI suggests for a new app.
 */
class LaravelOptions
{
    /** Collected by the form itself. */
    private const NOT_OPTIONS = ['name', 'email'];

    public function __construct(private FrameworkCatalog $catalog, private FrameworkForm $form) {}

    /**
     * @return list<array<string, mixed>>|null null when the CLI is missing or too old
     */
    public function questions(): ?array
    {
        $laravel = $this->catalog->framework('laravel');

        if ($laravel === null) {
            return null;
        }

        $questions = [];

        foreach ($laravel['fields'] as $field) {
            if (in_array($field['key'], self::NOT_OPTIONS, true) || ! in_array($field['type'] ?? null, ['select', 'multiselect'], true)) {
                continue;
            }

            $questions[] = ['default' => $field['suggested'] ?? $field['default'] ?? null] + $field;
        }

        return $questions;
    }

    /**
     * @param  array<string, mixed>  $answers
     * @return array{flags: list<string>, errors: array<string, string>}
     */
    public function flags(array $answers): array
    {
        $resolved = $this->form->resolve($this->questions() ?? [], $answers);

        return ['flags' => $resolved['flags'], 'errors' => $resolved['errors']];
    }
}
