<?php

use App\Enums\RunStatus;
use App\Models\CloudProvider;
use App\Models\Run;
use App\Services\GcpSignIn;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function gcpSignInWindows(): void
{
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: true));
    Process::fake(['*' => Process::result(output: "/usr/local/bin/larakube\n")]);
}

test('starting the sign-in keeps `larakube cloud:login` running as a run, in the distro', function () {
    gcpSignInWindows();
    $fake = ChildProcess::fake();

    $run = app(GcpSignIn::class)->start();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('cloud:login', (array) $cmd, true)
        && in_array('--provider=gcp', (array) $cmd, true)
        && in_array('--json', (array) $cmd, true)
        && in_array('--exec', (array) $cmd, true));

    expect($run->subject)->toBe('gcp-auth')
        ->and(app(GcpSignIn::class)->state($run)['state'])->toBe('starting');
});

test('the sign-in address is read from gcloud output, and the code is sent on stdin', function () {
    gcpSignInWindows();
    $fake = ChildProcess::fake();
    $signIn = app(GcpSignIn::class);
    $run = $signIn->start();

    $run->appendTo('output', "Go to the following link in your browser:\n\n    https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=x\n\nEnter authorization code: ");
    $run->refresh();

    expect($signIn->state($run))->toMatchArray(['state' => 'waiting-code', 'url' => 'https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=x']);

    $signIn->submitCode($run, '4/0AbCdEfGhIjKlMn');
    $run->refresh();

    $fake->assertMessage(fn (string $message, ?string $alias = null): bool => $message === "4/0AbCdEfGhIjKlMn\n" && $alias === $run->alias());
    expect($signIn->state($run)['state'])->toBe('signing-in');
});

test('a finished or failed sign-in is reported', function () {
    gcpSignInWindows();
    ChildProcess::fake();
    $signIn = app(GcpSignIn::class);
    $run = $signIn->start();

    $run->forceFill(['status' => RunStatus::Succeeded])->save();
    expect($signIn->state($run->refresh())['state'])->toBe('done');

    $run->forceFill(['status' => RunStatus::Failed, 'result' => ['success' => false, 'error' => 'Google Cloud sign-in did not finish.']])->save();
    expect($signIn->state($run->refresh()))->toMatchArray(['state' => 'failed', 'message' => 'Google Cloud sign-in did not finish.']);
});

test('the code is checked before it reaches the process', function () {
    $run = Run::create(['label' => 'x', 'subject' => 'gcp-auth', 'command' => ['gcloud'], 'status' => RunStatus::Running]);

    $this->post("/setup/cloud/gcp/login/{$run->id}/code", ['code' => 'x; rm -rf /'])->assertSessionHasErrors('code');
});

test('projects are listed by the CLI as ids and names', function () {
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: true));
    Process::fake([
        '*which*' => Process::result(output: "/usr/local/bin/larakube\n"),
        '*cloud:projects*' => Process::result(output: json_encode(['success' => true, 'projects' => [['id' => 'demo-123', 'name' => 'Demo']]])),
    ]);

    expect(app(GcpSignIn::class)->projects())->toBe([['id' => 'demo-123', 'name' => 'Demo']]);
});

test('saving gcp service account credentials delegates to CLI cloud:credentials', function () {
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: true));
    Process::fake([
        '*which*' => Process::result(output: "/usr/local/bin/larakube\n"),
        '*' => Process::result(output: json_encode([
            'success' => true,
            'provider' => 'gcp',
            'project_id' => 'my-gcp-project',
            'account' => 'sa@my-gcp-project.iam.gserviceaccount.com',
        ])),
    ]);

    $saJson = json_encode([
        'type' => 'service_account',
        'project_id' => 'my-gcp-project',
        'client_email' => 'sa@my-gcp-project.iam.gserviceaccount.com',
    ]);

    $this->post('/setup/cloud/gcp/service-account', ['credentials' => $saJson])
        ->assertRedirect()
        ->assertSessionHas('success');
});

test('starting sign-in reuses an active running session unless restart is requested', function () {
    gcpSignInWindows();
    ChildProcess::fake();
    $signIn = app(GcpSignIn::class);

    $initialRun = $signIn->start();
    expect($signIn->start()->id)->toBe($initialRun->id);

    // With restart = true, old run is cancelled and new run is started
    $restartedRun = $signIn->start(restart: true);
    expect($restartedRun->id)->not->toBe($initialRun->id)
        ->and($initialRun->fresh()->status)->toBe(RunStatus::Cancelled);
});

test('loginGcp endpoint reuses running session unless restart flag is sent', function () {
    gcpSignInWindows();
    ChildProcess::fake();

    $res1 = $this->postJson('/setup/cloud/gcp/login');
    $res1->assertOk();
    $runId1 = $res1->json('run');

    $res2 = $this->postJson('/setup/cloud/gcp/login');
    $res2->assertOk();
    expect($res2->json('run'))->toBe($runId1);

    $res3 = $this->postJson('/setup/cloud/gcp/login', ['restart' => true]);
    $res3->assertOk();
    expect($res3->json('run'))->not->toBe($runId1);
});

test('native sign-in without WSL passes LARAKUBE_STDIN_FILE and writes the code to that file', function () {
    $binDir = sys_get_temp_dir().'/larakube-gcp-test-'.bin2hex(random_bytes(4));
    @mkdir($binDir, 0755, true);
    file_put_contents($binDir.'/larakube.exe', '');

    try {
        putenv('SystemRoot=C:\\Windows');
        app()->instance(ToolLocator::class, new ToolLocator(directories: [$binDir], windows: true, wslFeatureEnabled: false));
        $fake = ChildProcess::fake();
        $signIn = app(GcpSignIn::class);

        $run = $signIn->start();
        $stdinFile = $run->meta['stdin_file'] ?? null;

        expect($stdinFile)->toBeString()->not->toBe('');
        $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => true);

        $signIn->submitCode($run, '  4/0NativeWinCode  ');

        expect(file_get_contents($stdinFile))->toBe("4/0NativeWinCode\n");
        expect($signIn->state($run->refresh())['state'])->toBe('signing-in');

        $signIn->start(restart: true);
        expect(is_file($stdinFile))->toBeFalse();
    } finally {
        @unlink($binDir.'/larakube.exe');
        @rmdir($binDir);
    }
});

test('selecting a gcp project refreshes SQLite provider credentials synchronously', function () {
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: true));

    CloudProvider::updateOrCreate(['slug' => 'gcp'], [
        'label' => 'Google Cloud Platform',
        'default_region' => 'us-central1',
        'default_vps_size' => 'e2-medium',
        'credentials_ready' => false,
        'credentials_hint' => 'No Google Cloud project selected.',
    ]);

    Process::fake([
        '*which*' => Process::result(output: "/usr/local/bin/larakube\n"),
        '*cloud:project*' => Process::result(output: json_encode(['success' => true, 'provider' => 'gcp', 'project' => 'my-gcp-project'])),
        '*cloud:providers*' => Process::result(output: json_encode([
            'success' => true,
            'providers' => [[
                'slug' => 'gcp',
                'label' => 'Google Cloud Platform',
                'credentials' => ['ready' => true, 'hint' => null],
                'activeAccount' => 'user@example.com',
                'accounts' => [['id' => 'user@example.com', 'label' => 'user@example.com', 'isDefault' => true]],
            ]],
        ])),
    ]);

    $this->postJson('/setup/cloud/gcp/project', ['project_id' => 'my-gcp-project'])
        ->assertOk()
        ->assertJson(['ok' => true]);

    $provider = CloudProvider::where('slug', 'gcp')->firstOrFail();

    expect($provider->credentials_ready)->toBeTrue()
        ->and($provider->credentials_hint)->toBeNull()
        ->and($provider->active_account)->toBe('user@example.com')
        ->and($provider->accounts)->toHaveCount(1);
});
