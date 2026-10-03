<?php

namespace App\Services\LaraKube;

/**
 * Turns a framework's answers into `larakube *:new` arguments by following the
 * field schema the CLI sent, so no framework is special-cased here. Anything
 * the CLI would not offer for the answers given is rejected.
 */
class FrameworkForm
{
    /**
     * @param  list<array<string, mixed>>  $fields
     * @param  array<string, mixed>  $answers
     * @return array{positional: string|null, flags: list<string>, errors: array<string, string>}
     */
    public function resolve(array $fields, array $answers): array
    {
        $answers = $this->implied($fields, $answers);
        $positional = null;
        $flags = [];
        $errors = [];

        foreach ($fields as $field) {
            $key = (string) $field['key'];

            if (! $this->visible($field, $answers)) {
                continue;
            }

            $answer = $this->forced($field, $answers) ?? ($answers[$key] ?? null);
            $label = (string) ($field['label'] ?? $key);
            $type = (string) ($field['type'] ?? 'text');

            if ($type === 'confirm') {
                if ($answer === true || $answer === 'true' || $answer === 1 || $answer === '1') {
                    $flags = [...$flags, ...$this->flagsFor($field, null, true)];
                }

                continue;
            }

            if ($type === 'text') {
                $value = is_string($answer) ? trim($answer) : '';

                if ($value === '') {
                    if (! empty($field['required'])) {
                        $errors[$key] = "Enter {$label}.";
                    }

                    continue;
                }

                if (($error = $this->invalidText($field, $value, $label)) !== null) {
                    $errors[$key] = $error;

                    continue;
                }

                if (($field['arg'] ?? null) === 'positional') {
                    $positional = $value;
                } else {
                    $flags = [...$flags, ...$this->flagsFor($field, null, $value)];
                }

                continue;
            }

            $available = $this->available($field, $answers);
            $values = $type === 'multiselect'
                ? (is_array($answer) ? $answer : [])
                : ($answer === null || $answer === '' ? [] : [$answer]);

            if ($values === [] && $type !== 'multiselect' && empty($field['nullable']) && ! empty($field['required'])) {
                $errors[$key] = "Choose a {$label}.";

                continue;
            }

            foreach ($values as $value) {
                if (! is_string($value) || ! array_key_exists($value, $available)) {
                    $errors[$key] = "That {$label} isn't available here.";

                    continue 2;
                }

                $flags = [...$flags, ...$this->flagsFor($field, $available[$value], $value)];
            }

            foreach ($field['conflicts'] ?? [] as $conflict) {
                if (is_array($conflict) && count(array_intersect($conflict, $values)) > 1) {
                    $errors[$key] = 'Choose only one of '.implode(' and ', $conflict).'.';
                }
            }
        }

        return ['positional' => $positional, 'flags' => $flags, 'errors' => $errors];
    }

    /**
     * The flag(s) that carry one answer: the option's own flag, or the field's
     * `--name=` flag with the value appended. No flag at all means "nothing to pass".
     *
     * @param  array<string, mixed>  $field
     * @return list<string>
     */
    private function flagsFor(array $field, ?string $optionFlag, string|bool $value): array
    {
        if ($optionFlag !== null) {
            return [$optionFlag];
        }

        $flag = $field['flag'] ?? null;

        if (! is_string($flag) || $flag === '') {
            return [];
        }

        return [is_string($value) && str_ends_with($flag, '=') ? $flag.$value : rtrim($flag, '=')];
    }

    /**
     * @param  array<string, mixed>  $field
     */
    private function invalidText(array $field, string $value, string $label): ?string
    {
        if (($field['format'] ?? null) === 'email' && filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            return "{$label} must be a valid email address.";
        }

        if (isset($field['maxLength']) && mb_strlen($value) > (int) $field['maxLength']) {
            return "{$label} must be at most {$field['maxLength']} characters.";
        }

        if (in_array($value, (array) ($field['reserved'] ?? []), true)) {
            return "The name \"{$value}\" is reserved.";
        }

        if (is_string($field['pattern'] ?? null) && preg_match('~'.$field['pattern'].'~', $value) !== 1) {
            return (string) ($field['description'] ?? "{$label} isn't valid.");
        }

        return null;
    }

    /**
     * A select's options by value => flag (null when the option has none),
     * minus those that rule themselves out under the chosen server.
     *
     * @param  array<string, mixed>  $field
     * @param  array<string, mixed>  $answers
     * @return array<string, string|null>
     */
    private function available(array $field, array $answers): array
    {
        $server = is_string($answers['server'] ?? null) ? $answers['server'] : null;
        $available = [];

        foreach ((array) ($field['options'] ?? []) as $option) {
            if (! is_array($option) || ! is_string($option['value'] ?? null)) {
                continue;
            }

            if ($server !== null && in_array($server, (array) ($option['unavailableWith'] ?? []), true)) {
                continue;
            }

            $available[$option['value']] = is_string($option['flag'] ?? null) ? $option['flag'] : null;
        }

        return $available;
    }

    /**
     * @param  array<string, mixed>  $field
     * @param  array<string, mixed>  $answers
     */
    private function visible(array $field, array $answers): bool
    {
        $conditions = $field['visibleWhen'] ?? (isset($field['requiresFeature']) ? ['features' => $field['requiresFeature']] : []);

        return $this->matches((array) $conditions, $answers);
    }

    /**
     * @param  array<string, mixed>  $field
     * @param  array<string, mixed>  $answers
     */
    private function forced(array $field, array $answers): mixed
    {
        foreach ((array) ($field['forcedWhen'] ?? []) as $rule) {
            if (is_array($rule) && $this->matches((array) ($rule['when'] ?? []), $answers)) {
                return $rule['value'] ?? null;
            }
        }

        return null;
    }

    /**
     * Picking an option can imply another answer (FrankenPHP implies Octane).
     *
     * @param  list<array<string, mixed>>  $fields
     * @param  array<string, mixed>  $answers
     * @return array<string, mixed>
     */
    private function implied(array $fields, array $answers): array
    {
        foreach ($fields as $field) {
            foreach ((array) ($field['implies'] ?? []) as $value => $implied) {
                if (($answers[$field['key']] ?? null) !== $value || ! is_array($implied)) {
                    continue;
                }

                foreach ($implied as $key => $add) {
                    $current = $answers[$key] ?? [];
                    $answers[$key] = is_array($current) ? array_values(array_unique([...$current, $add])) : $add;
                }
            }
        }

        return $answers;
    }

    /**
     * @param  array<string, mixed>  $conditions
     * @param  array<string, mixed>  $answers
     */
    private function matches(array $conditions, array $answers): bool
    {
        foreach ($conditions as $key => $expected) {
            $actual = $answers[$key] ?? null;

            if (! (is_array($actual) ? in_array($expected, $actual, true) : $actual === $expected)) {
                return false;
            }
        }

        return true;
    }
}
