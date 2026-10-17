<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\QuickLaunchAppRequest;
use App\Models\Server;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\FrameworkForm;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuickActionController extends Controller
{
    public function __construct(
        private StackCatalog $stacks,
        private ToolCatalog $tools,
    ) {}

    /**
     * A tool's own deploy options, as the CLI describes them — ADR 0010:
     * Quick Launch draws these live rather than hand-curating a picker per
     * tool, the same source `optionFields()` below already feeds `launch()`.
     */
    public function fields(Request $request): JsonResponse
    {
        $request->validate(['tool' => ['required', 'string', 'max:64'], 'server' => ['required', 'string', 'max:128']]);

        $stack = $this->readyServer($request->string('server')->toString());
        $context = (string) $stack['context'];
        $row = $this->tools->find($context, $request->string('tool')->trim()->lower()->toString());

        abort_if($row === null, 404);

        $isLocal = Server::isStackLocal($stack);

        return response()->json(['fields' => $this->optionFields($row, $isLocal)]);
    }

    public function launch(QuickLaunchAppRequest $request, CliRunner $runner): JsonResponse
    {
        $server = $request->string('server')->toString();
        $tool = $request->string('tool')->trim()->lower()->toString();
        $domain = $request->string('domain')->trim()->lower()->toString();
        $adminEmail = $request->string('admin_email')->trim()->toString();

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

        $isLocal = Server::isStackLocal($stack);

        $resolved = app(FrameworkForm::class)->resolve(
            $this->optionFields($row, $isLocal),
            $extraOptions,
        );

        if ($resolved['errors'] !== []) {
            return response()->json([
                'message' => 'One or more options are invalid.',
                'errors' => collect($resolved['errors'])->mapWithKeys(fn (string $error, string $key): array => ["options.{$key}" => [$error]])->all(),
            ], 422);
        }

        // Arguments for tool:add
        $arguments = [
            'tool:add',
            "--tool={$tool}",
            "--context={$context}",
            "--domain={$domain}",
            ...($adminEmail !== '' && $needsAdminEmail ? ["--admin-email={$adminEmail}"] : []),
            $request->boolean('wire_sso') ? '--wire-sso' : '--no-wire-sso',
            $request->boolean('wire_mail') ? '--wire-mail' : '--no-wire-mail',
            ...$resolved['flags'],
            ...($request->boolean('confirm_commons_restart') ? ['--confirm-commons-restart'] : []),
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
                'options' => (string) json_encode($extraOptions),
                ...($adminEmail !== '' ? ['admin_email' => $adminEmail] : []),
            ],
            targetType: 'tool',
            targetName: $displayName,
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return response()->json([
            'run' => [
                'id' => $run->id,
                'label' => $run->label,
                'status' => $run->status->value,
            ],
            'tool' => [
                'slug' => $tool,
                'displayName' => $displayName,
                'domain' => $domain,
            ],
        ]);
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
     * A tool's init fields, minus the ones Quick Launch already has its own
     * dedicated UI for: `host` (the Domain/Host Address picker) and `account`
     * (the Administrator Email field) — rendering them again here would be a
     * confusing duplicate, and for `host` specifically, resolving it into a
     * second `--domain=` flag that could disagree with the dedicated one.
     *
     * @param  array<string, mixed>  $row
     * @return list<array<string, mixed>>
     */
    private function optionFields(array $row, bool $isLocal = false): array
    {
        $fields = is_array($row['initFields'] ?? null) ? $row['initFields'] : [];

        $filtered = array_values(array_filter($fields, fn (array $field): bool => ! in_array($field['role'] ?? 'option', ['host', 'account'], true)));

        if ($isLocal) {
            foreach ($filtered as &$field) {
                if (($field['key'] ?? '') === 'proxied') {
                    $field['default'] = '0';
                }
            }
            unset($field);
        }

        return $filtered;
    }
}
