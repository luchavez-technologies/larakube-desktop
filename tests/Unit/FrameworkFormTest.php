<?php

use App\Services\LaraKube\FrameworkForm;

function multipleTextField(array $overrides = []): array
{
    return array_merge([
        'key' => 'customEnv',
        'type' => 'text',
        'label' => 'Custom Environment Variable',
        'multiple' => true,
        'flag' => '--custom-env=',
        'required' => false,
    ], $overrides);
}

test('a multiple text field emits one flag per non-empty entry', function (): void {
    $result = (new FrameworkForm)->resolve(
        [multipleTextField()],
        ['customEnv' => ['FEATURE_X=true', 'FEATURE_Y=false']],
    );

    expect($result['errors'])->toBe([])
        ->and($result['flags'])->toBe([
            '--custom-env=FEATURE_X=true',
            '--custom-env=FEATURE_Y=false',
        ]);
});

test('a multiple text field skips blank entries without erroring', function (): void {
    $result = (new FrameworkForm)->resolve(
        [multipleTextField()],
        ['customEnv' => ['', '  ', 'FEATURE_X=true']],
    );

    expect($result['errors'])->toBe([])
        ->and($result['flags'])->toBe(['--custom-env=FEATURE_X=true']);
});

test('a required multiple text field errors only when every entry is empty', function (): void {
    $result = (new FrameworkForm)->resolve(
        [multipleTextField(['required' => true])],
        ['customEnv' => ['', '']],
    );

    expect($result['flags'])->toBe([])
        ->and($result['errors'])->toBe(['customEnv' => 'Enter Custom Environment Variable.']);
});

test('a required multiple text field with at least one entry does not error', function (): void {
    $result = (new FrameworkForm)->resolve(
        [multipleTextField(['required' => true])],
        ['customEnv' => ['FEATURE_X=true']],
    );

    expect($result['errors'])->toBe([]);
});

test('a multiple text field with no answer at all is simply empty, not an error', function (): void {
    $result = (new FrameworkForm)->resolve([multipleTextField()], []);

    expect($result['errors'])->toBe([])
        ->and($result['flags'])->toBe([]);
});

test('a multiple text field still validates each entry with the field\'s own rules', function (): void {
    $result = (new FrameworkForm)->resolve(
        [multipleTextField(['pattern' => '^[A-Z_]+=.+$', 'description' => 'Must look like KEY=value'])],
        ['customEnv' => ['lowercase=nope']],
    );

    expect($result['flags'])->toBe([])
        ->and($result['errors'])->toBe(['customEnv' => 'Must look like KEY=value']);
});

test('a single (non-multiple) text field is unaffected by the multiple-field path', function (): void {
    $result = (new FrameworkForm)->resolve(
        [[
            'key' => 'adminEmail',
            'type' => 'text',
            'label' => 'Admin Email',
            'flag' => '--admin-email=',
            'required' => true,
        ]],
        ['adminEmail' => 'admin@example.com'],
    );

    expect($result['flags'])->toBe(['--admin-email=admin@example.com'])
        ->and($result['errors'])->toBe([]);
});

function frankenphpOctaneFields(): array
{
    return [
        [
            'key' => 'server',
            'type' => 'select',
            'label' => 'Server variation',
            'implies' => ['frankenphp' => ['features' => 'octane']],
            'options' => [
                ['value' => 'fpm-nginx', 'flag' => '--fpm-nginx', 'unavailableWith' => []],
                ['value' => 'frankenphp', 'flag' => '--frankenphp', 'unavailableWith' => []],
            ],
        ],
        [
            'key' => 'features',
            'type' => 'multiselect',
            'label' => 'Laravel features',
            'options' => [
                ['value' => 'reverb', 'flag' => '--reverb', 'unavailableWith' => []],
                ['value' => 'octane', 'flag' => '--octane', 'unavailableWith' => ['frankenphp']],
            ],
        ],
    ];
}

test('an implied option the chosen server hides is left to the CLI instead of failing validation', function (): void {
    $result = (new FrameworkForm)->resolve(
        frankenphpOctaneFields(),
        ['server' => 'frankenphp', 'features' => ['reverb']],
    );

    expect($result['errors'])->toBe([])
        ->and($result['flags'])->toBe(['--frankenphp', '--reverb']);
});

test('an implied option the chosen server offers is still added', function (): void {
    $fields = frankenphpOctaneFields();
    $fields[1]['options'][1]['unavailableWith'] = [];

    $result = (new FrameworkForm)->resolve($fields, ['server' => 'frankenphp', 'features' => []]);

    expect($result['errors'])->toBe([])
        ->and($result['flags'])->toBe(['--frankenphp', '--octane']);
});

function teamsFields(): array
{
    return [
        [
            'key' => 'frontend',
            'type' => 'select',
            'label' => 'Frontend stack',
            'nullable' => true,
            'options' => [
                ['value' => 'react', 'flag' => '--react', 'unavailableWith' => []],
                ['value' => 'vite', 'flag' => '--vite', 'unavailableWith' => []],
            ],
        ],
        [
            'key' => 'teams',
            'type' => 'confirm',
            'label' => 'Teams',
            'flag' => '--teams',
            'default' => false,
            'visibleWhen' => ['frontend' => ['react', 'vue', 'svelte', 'livewire']],
        ],
    ];
}

test('Teams is passed when it is ticked with a starter kit', function (): void {
    $result = (new FrameworkForm)->resolve(teamsFields(), ['frontend' => 'react', 'teams' => true]);

    expect($result['errors'])->toBe([])
        ->and($result['flags'])->toBe(['--react', '--teams']);
});

test('Teams is dropped for a frontend without a starter kit, even when ticked', function (): void {
    expect((new FrameworkForm)->resolve(teamsFields(), ['frontend' => 'vite', 'teams' => true])['flags'])->toBe(['--vite'])
        ->and((new FrameworkForm)->resolve(teamsFields(), ['frontend' => null, 'teams' => true])['flags'])->toBe([]);
});
