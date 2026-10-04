<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\StoreServerRequest;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\DevBoxShell;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Experimental. Dev boxes: servers used as development machines, made by `devbox:create`.
 * Restarting and destroying one is the same as for any server the CLI made.
 */
class DevBoxController extends Controller
{
    /** The variable the CLI reads the Cloudflare token from on the box. */
    private const TOKEN_VARIABLE = 'CLOUDFLARE_API_TOKEN';

    public function __construct(private GlobalSettings $settings) {}

    /** With the feature off the page says so and points to Settings, instead of failing. */
    public function index(StackCatalog $catalog, DevBoxShell $shell): Response
    {
        if (! $this->settings->experimental()) {
            return Inertia::render('devboxes/index', ['disabled' => true]);
        }

        return Inertia::render('devboxes/index', [
            'disabled' => false,
            'devBoxes' => Inertia::defer(fn (): ?array => $catalog->devBoxes()),
            // The projects on each box, asked of the box itself; a box that does not answer has none listed.
            'projects' => Inertia::defer(function () use ($catalog, $shell): array {
                $byBox = [];

                foreach ($catalog->devBoxes() ?? [] as $box) {
                    $result = $box['status'] === 'ready' ? $shell->json($box, ['project:list', '--json']) : null;
                    $byBox[$box['name']] = is_array($result['projects'] ?? null) ? array_values($result['projects']) : null;
                }

                return $byBox;
            }, 'projects'),
        ]);
    }

    public function create(ReadinessCheck $readiness): Response|RedirectResponse
    {
        if (! $this->settings->experimental()) {
            return to_route('devboxes.index');
        }

        return Inertia::render('servers/create', [
            'kind' => 'dev-box',
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers()),
            'project' => null,
        ]);
    }

    public function store(StoreServerRequest $request, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();

        $provider = $request->string('provider')->toString();
        $stackName = $request->string('stack_name')->toString();

        $run = $runner->start(
            label: "Create dev box {$stackName}",
            arguments: [
                'devbox:create',
                "--provider={$provider}",
                "--stack-name={$stackName}",
                '--region='.$request->string('region'),
                '--size='.$request->string('size'),
                '--channel='.$this->settings->get()['cliChannel'],
                '--json',
            ],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::CreateDevBox,
            subject: $stackName,
            meta: ['server' => $stackName, 'role' => 'dev'],
            targetType: 'server',
            targetName: $stackName,
            serverName: $stackName,
        );

        return to_route('runs.show', $run);
    }

    /**
     * Installs the CLI on the box again from the channel Desktop is on. The installer is the one that put it there, so it
     * has the permission to replace the binary and is safe to run any number of times.
     */
    public function updateCli(string $box, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();

        $stack = collect($catalog->devBoxes() ?? [])->firstWhere('name', $box);
        abort_if($stack === null || $stack['status'] !== 'ready', 404);

        $channel = $this->settings->get()['cliChannel'] === 'stable' ? '' : ' -s -- --canary';

        $run = $runner->start(
            label: "Update the LaraKube CLI on {$box}",
            arguments: [],
            kind: RunKind::UpdateDevBoxCli,
            subject: $box,
            meta: ['server' => $box, 'role' => 'dev'],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
            devBox: $stack,
            // Also leaves the marker that tells the CLI on the box it is a dev box, for boxes made before it existed.
            devBoxScript: 'curl -fsSL https://cli.larakube.app/install.sh | bash'.$channel
                .' && mkdir -p "$HOME/.larakube" && printf \'%s\\n\' '.escapeshellarg($box).' > "$HOME/.larakube/devbox"'
                .' && /usr/local/bin/larakube --version',
        );

        return to_route('runs.show', $run);
    }

    /** Starts a temporary public link to the app, from the box. The link is on the run's page when it finishes. */
    public function share(string $box, string $project, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        return $this->shareRun($box, $project, $catalog, $runner, RunKind::ShareDevBoxProject, "Share {$project} from {$box}", ['share', '--detach', '--json']);
    }

    public function unshare(string $box, string $project, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        return $this->shareRun($box, $project, $catalog, $runner, RunKind::UnshareDevBoxProject, "Stop sharing {$project} from {$box}", ['share', '--stop', '--json']);
    }

    /** @param  list<string>  $arguments */
    private function shareRun(string $box, string $project, StackCatalog $catalog, CliRunner $runner, RunKind $kind, string $label, array $arguments): RedirectResponse
    {
        $this->ensureEnabled();

        $stack = collect($catalog->devBoxes() ?? [])->firstWhere('name', $box);
        abort_if($stack === null || $stack['status'] !== 'ready', 404);

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            kind: $kind,
            subject: $project,
            meta: ['server' => $box, 'role' => 'dev', 'app' => $project],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
            devBox: $stack,
            devBoxProject: $project,
        );

        return to_route('runs.show', $run);
    }

    /** The page that asks for a Cloudflare API token and the domain to share an app under. */
    public function shareDomainPage(string $box, string $project, StackCatalog $catalog): Response
    {
        $this->ensureEnabled();
        abort_if($this->readyBox($box, $catalog) === null, 404);

        return Inertia::render('devboxes/share-domain', ['box' => $box, 'project' => $project]);
    }

    /** The domains a Cloudflare API token can see, asked of the box. The token is sent on standard input and not kept. */
    public function domains(Request $request, string $box, StackCatalog $catalog, DevBoxShell $shell): JsonResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $token = $this->cloudflareToken($request);
        $result = $shell->json($stack, ['share:domains', '--json'], 60, [self::TOKEN_VARIABLE, $token]);

        if ($result === null) {
            return response()->json(['message' => 'The box could not list your domains with that token. Check it has Zone → Zone → Read, and that the box is reachable.'], 422);
        }

        return response()->json(['domains' => array_values((array) ($result['domains'] ?? []))]);
    }

    public function shareDomain(Request $request, string $box, string $project, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $request->validate(['domain' => ['required', 'string', 'max:253', 'regex:/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/']]);

        return $this->domainRun($request, $box, $project, $catalog, $runner, RunKind::ShareDomainDevBoxProject, "Share {$project} under {$request->string('domain')->toString()}", ['share:domain', '--domain='.$request->string('domain')->toString(), '--box='.$box, '--json']);
    }

    public function removeDomain(Request $request, string $box, string $project, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        return $this->domainRun($request, $box, $project, $catalog, $runner, RunKind::RemoveDomainDevBoxProject, "Remove the public names of {$project}", ['share:domain-remove', '--force', '--json']);
    }

    /** @param  list<string>  $arguments */
    private function domainRun(Request $request, string $box, string $project, StackCatalog $catalog, CliRunner $runner, RunKind $kind, string $label, array $arguments): RedirectResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $token = $this->cloudflareToken($request);

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            secretEnvironment: [self::TOKEN_VARIABLE => $token],
            kind: $kind,
            subject: $project,
            meta: ['server' => $box, 'role' => 'dev', 'app' => $project],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
            devBox: $stack,
            devBoxProject: $project,
            devBoxReadSecret: self::TOKEN_VARIABLE,
        );

        return to_route('runs.show', $run);
    }

    private function cloudflareToken(Request $request): string
    {
        return trim($request->validate(['token' => ['required', 'string', 'max:200', 'regex:/^[A-Za-z0-9_-]+$/']])['token']);
    }

    /** @return array<string, mixed>|null */
    private function readyBox(string $box, StackCatalog $catalog): ?array
    {
        $stack = collect($catalog->devBoxes() ?? [])->firstWhere('name', $box);

        return $stack !== null && $stack['status'] === 'ready' ? $stack : null;
    }

    private function ensureEnabled(): void
    {
        abort_unless($this->settings->experimental(), 404);
    }
}
