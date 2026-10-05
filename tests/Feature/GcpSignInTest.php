<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\GcpSignIn;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function gcpSignInWindows(): void
{
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));
    Process::fake(['*' => Process::result(output: "/usr/bin/gcloud\n")]);
}

test('starting the sign-in keeps gcloud running as a run, in the distro, without a browser', function () {
    gcpSignInWindows();
    $fake = ChildProcess::fake();

    $run = app(GcpSignIn::class)->start();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('--no-launch-browser', (array) $cmd, true)
        && in_array('--update-adc', (array) $cmd, true)
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

    $run->appendTo('output', "ERROR: invalid_grant\n");
    $run->forceFill(['status' => RunStatus::Failed])->save();
    expect($signIn->state($run->refresh()))->toMatchArray(['state' => 'failed', 'message' => 'ERROR: invalid_grant']);
});

test('the code is checked before it reaches the process', function () {
    $run = Run::create(['label' => 'x', 'subject' => 'gcp-auth', 'command' => ['gcloud'], 'status' => RunStatus::Running]);

    $this->post("/setup/cloud/gcp/login/{$run->id}/code", ['code' => 'x; rm -rf /'])->assertSessionHasErrors('code');
});

test('projects are listed from gcloud as ids and names', function () {
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));
    Process::fake([
        '*which*' => Process::result(output: "/usr/bin/gcloud\n"),
        '*projects*' => Process::result(output: json_encode([['projectId' => 'demo-123', 'name' => 'Demo']])),
    ]);

    expect(app(GcpSignIn::class)->projects())->toBe([['id' => 'demo-123', 'name' => 'Demo']]);
});
