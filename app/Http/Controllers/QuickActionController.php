<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\QuickLaunchAppRequest;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\FrameworkForm;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use Illuminate\Http\RedirectResponse;

class QuickActionController extends Controller
{
    public function __construct(
        private StackCatalog $stacks,
        private ToolCatalog $tools,
    ) {}

    public function launch(QuickLaunchAppRequest $request, CliRunner $runner): RedirectResponse
    {
        $server = $request->string('server')->toString();
        $tool = $request->string('tool')->trim()->lower()->toString();
        $domain = $request->string('domain')->trim()->lower()->toString();
        $adminEmail = $request->string('admin_email')->trim()->toString();
        $database = $request->string('database')->trim()->lower()->toString();

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $row = $this->tools->find($context, $tool);

        abort_if($row === null, 404);

        $displayName = (string) preg_replace('/\s*\[[^\]]*\]$/', '', (string) ($row['brand'] ?? ucfirst($tool)));

        $needsAdminEmail = is_array($row['initFields'] ?? null)
            ? collect($row['initFields'])->contains('key', 'adminEmail')
            : (bool) ($row['requiresAdminEmail'] ?? false);

        if ($adminEmail === '' && $needsAdminEmail) {
            $adminEmail = is_string($stack['account'] ?? null) && str_contains((string) $stack['account'], '@')
                ? (string) $stack['account']
                : "admin@{$domain}";
        }

        $extraOptions = (array) $request->input('options', []);
        if ($database !== '' && $tool === 'wordpress') {
            $extraOptions['db'] = $database;
        }

        $resolved = app(FrameworkForm::class)->resolve(
            $this->optionFields($row),
            $extraOptions,
        );

        if ($resolved['errors'] !== []) {
            return back()->withErrors(collect($resolved['errors'])->mapWithKeys(fn (string $error, string $key): array => ["options.{$key}" => $error])->all());
        }

        $extraFlags = [];
        if ($database !== '' && $tool === 'wordpress') {
            $dbFlag = "--db={$database}";
            if (! in_array($dbFlag, $resolved['flags'], true)) {
                $extraFlags[] = $dbFlag;
            }
        }

        // Arguments for tool:add
        $arguments = [
            'tool:add',
            "--tool={$tool}",
            "--context={$context}",
            "--domain={$domain}",
            ...($adminEmail !== '' ? ["--admin-email={$adminEmail}"] : []),
            $request->boolean('wire_sso') ? '--wire-sso' : '--no-wire-sso',
            $request->boolean('wire_mail') ? '--wire-mail' : '--no-wire-mail',
            ...$extraFlags,
            ...$resolved['flags'],
            '--force',
        ];

        $run = $runner->start(
            label: "1-Click Deploy {$displayName} on {$server}",
            arguments: $arguments,
            kind: RunKind::QuickLaunchApp,
            subject: $tool,
            meta: [
                'server' => $server,
                'context' => $context,
                'tool' => $tool,
                'host' => $domain,
                'database' => $database,
                ...($adminEmail !== '' ? ['admin_email' => $adminEmail] : []),
            ],
            targetType: 'tool',
            targetName: $displayName,
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return to_route('runs.show', $run);
    }

    /**
     * @return array<string, mixed>
     */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return $stack;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return list<array<string, mixed>>
     */
    private function optionFields(array $row): array
    {
        $fields = is_array($row['initFields'] ?? null) ? $row['initFields'] : [];

        return array_values(array_filter($fields, fn (array $field): bool => ($field['key'] ?? '') !== 'adminEmail'));
    }
}
