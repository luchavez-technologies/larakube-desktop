<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * The questions `larakube new` asks, read from `larakube new:options --json`,
 * so the new-app form offers exactly what the installed LaraKube CLI supports.
 * Each option carries the flag that answers it headlessly.
 */
class LaravelOptions
{
    /**
     * Where the desktop's defaults differ from `new --fast`: a workshop app
     * gets a starter kit, PostgreSQL (the Plex Commons database) and the
     * lighter FPM + Nginx server.
     */
    public const DEFAULTS = [
        'frontend' => 'react',
        'database' => 'postgres',
        'server' => 'fpm-nginx',
    ];

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array{key: string, label: string, multiple: bool, nullable: bool, default: string|null, options: list<array{value: string, label: string, flag: string, unavailableWith: list<string>}>, conflicts?: list<list<string>>, requiresFeature?: string}>|null
     */
    public function questions(): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $key = 'larakube.new-options.'.md5($cli.'|'.(string) @filemtime($cli));

        $cached = Cache::get($key);

        if (is_array($cached)) {
            return $this->normalize($cached);
        }

        $isolated = $this->locator->isolate([$cli, 'new:options', '--json', '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout(30)->run($isolated['command']);

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! $result->successful() || ! is_array($decoded) || ! is_array($decoded['questions'] ?? null)) {
            return null;
        }

        Cache::forever($key, $decoded['questions']);

        return $this->normalize($decoded['questions']);
    }

    /**
     * Keep only well-formed questions from the CLI's JSON, and apply DEFAULTS.
     *
     * @param  array<mixed>  $raw
     * @return list<array{key: string, label: string, multiple: bool, nullable: bool, default: string|null, options: list<array{value: string, label: string, flag: string, unavailableWith: list<string>}>, conflicts?: list<list<string>>, requiresFeature?: string}>
     */
    private function normalize(array $raw): array
    {
        $questions = [];

        foreach ($raw as $question) {
            if (! is_array($question) || ! is_string($question['key'] ?? null) || ! is_string($question['label'] ?? null) || ! is_array($question['options'] ?? null)) {
                continue;
            }

            $options = [];

            foreach ($question['options'] as $option) {
                if (is_array($option) && is_string($option['value'] ?? null) && is_string($option['label'] ?? null) && is_string($option['flag'] ?? null)) {
                    $options[] = [
                        'value' => $option['value'],
                        'label' => $option['label'],
                        'flag' => $option['flag'],
                        'unavailableWith' => $this->strings($option['unavailableWith'] ?? []),
                    ];
                }
            }

            $default = self::DEFAULTS[$question['key']] ?? (is_string($question['default'] ?? null) ? $question['default'] : null);
            $normalized = [
                'key' => $question['key'],
                'label' => $question['label'],
                'multiple' => ($question['multiple'] ?? false) === true,
                'nullable' => ($question['nullable'] ?? false) === true,
                'default' => $default,
                'options' => $options,
            ];

            if (is_array($question['conflicts'] ?? null)) {
                $normalized['conflicts'] = array_map(fn (mixed $conflict): array => $this->strings($conflict), array_values($question['conflicts']));
            }

            if (is_string($question['requiresFeature'] ?? null)) {
                $normalized['requiresFeature'] = $question['requiresFeature'];
            }

            $questions[] = $normalized;
        }

        return $questions;
    }

    /**
     * @return list<string>
     */
    private function strings(mixed $values): array
    {
        return is_array($values) ? array_values(array_filter($values, is_string(...))) : [];
    }

    /**
     * Turn the form's answers into `larakube new` flags, rejecting anything
     * the CLI wouldn't offer for the chosen server.
     *
     * @param  array<string, mixed>  $answers
     * @return array{flags: list<string>, errors: array<string, string>}
     */
    public function flags(array $answers): array
    {
        $questions = $this->questions() ?? [];
        $byKey = array_column($questions, null, 'key');
        $server = is_string($answers['server'] ?? null) ? $answers['server'] : null;
        $features = is_array($answers['features'] ?? null) ? $answers['features'] : [];
        $flags = [];
        $errors = [];

        foreach ($byKey as $key => $question) {
            if (isset($question['requiresFeature']) && ! in_array($question['requiresFeature'], $features, true)) {
                continue;
            }

            $available = array_column(array_filter(
                $question['options'],
                fn (array $option): bool => $server === null || ! in_array($server, $option['unavailableWith'], true),
            ), 'flag', 'value');
            $answer = $answers[$key] ?? null;
            $values = $question['multiple'] ? (is_array($answer) ? $answer : []) : ($answer === null || $answer === '' ? [] : [$answer]);

            if ($values === [] && ! $question['multiple'] && ! $question['nullable']) {
                $errors[$key] = "Choose a {$question['label']}.";

                continue;
            }

            foreach ($values as $value) {
                if (! is_string($value) || ! array_key_exists($value, $available)) {
                    $errors[$key] = "That {$question['label']} isn't available here.";

                    continue 2;
                }

                $flags[] = $available[$value];
            }

            foreach ($question['conflicts'] ?? [] as $conflict) {
                if (count(array_intersect($conflict, $values)) > 1) {
                    $errors[$key] = 'Choose only one of '.implode(' and ', $conflict).'.';
                }
            }
        }

        return ['flags' => $flags, 'errors' => $errors];
    }
}
