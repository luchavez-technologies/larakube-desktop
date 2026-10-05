<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\GcpSignIn;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use App\Services\Runtime\WslDistro;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use RuntimeException;

class CloudAuthController extends Controller
{
    public function saveAws(Request $request, ToolLocator $locator, GlobalSettings $settings): RedirectResponse
    {
        $validated = $request->validate([
            'access_key_id' => ['required', 'string', 'regex:/^[A-Z0-9]{16,32}$/'],
            'secret_access_key' => ['required', 'string', 'min:16'],
            'region' => ['required', 'string', 'regex:/^[a-z0-9-]+$/'],
        ]);

        $credentialsContent = "[default]\naws_access_key_id = {$validated['access_key_id']}\naws_secret_access_key = {$validated['secret_access_key']}\n";
        $configContent = "[default]\nregion = {$validated['region']}\noutput = json\n";

        $saved = $locator->isWindows()
            ? $this->writeInDistro($locator, ['credentials' => $credentialsContent, 'config' => $configContent])
            : $this->writeOnThisComputer(['credentials' => $credentialsContent, 'config' => $configContent]);

        if (! $saved) {
            return back()->withErrors(['aws' => 'Could not save the AWS credentials.']);
        }

        // Verify with AWS STS if aws CLI is installed
        $awsBin = $locator->find('aws');
        if ($awsBin !== null) {
            $isolated = $locator->isolate([$awsBin, 'sts', 'get-caller-identity']);
            $res = Process::env($isolated['environment'])->timeout(15)->run($isolated['command']);

            if (! $res->successful()) {
                return back()->withErrors(['aws' => 'AWS credentials saved, but authentication verification failed: '.trim($res->errorOutput() ?: $res->output())]);
            }
        }

        return back()->with('success', 'AWS credentials saved and verified successfully.');
    }

    /**
     * The CLI runs inside the distro on Windows, so that is where its ~/.aws has to be. Each file is made empty with mode 600
     * first, and the secret reaches `tee` on stdin, never in a command line.
     *
     * @param  array<string, string>  $files
     */
    private function writeInDistro(ToolLocator $locator, array $files): bool
    {
        $directory = WslDistro::HOME.'/.aws';

        if (! $locator->run(['/usr/bin/install', '-d', '-m', '700', $directory])->successful()) {
            return false;
        }

        foreach ($files as $name => $content) {
            $path = "{$directory}/{$name}";

            if (! $locator->run(['/usr/bin/install', '-m', '600', '/dev/null', $path])->successful()
                || ! $locator->run(['/usr/bin/tee', $path], input: $content)->successful()) {
                return false;
            }
        }

        return true;
    }

    /** @param  array<string, string>  $files */
    private function writeOnThisComputer(array $files): bool
    {
        $home = ToolLocator::home();

        if ($home === '') {
            return false;
        }

        $directory = "{$home}/.aws";

        if (! is_dir($directory)) {
            File::makeDirectory($directory, 0700, true);
        }

        foreach ($files as $name => $content) {
            File::put("{$directory}/{$name}", $content);
            chmod("{$directory}/{$name}", 0600);
        }

        return true;
    }

    public function loginGcp(GcpSignIn $signIn): JsonResponse
    {
        try {
            $run = $signIn->start();
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['run' => $run->id]);
    }

    public function gcpLoginStatus(Run $run, GcpSignIn $signIn): JsonResponse
    {
        abort_unless($run->subject === GcpSignIn::SUBJECT, 404);

        return response()->json($signIn->state($run));
    }

    public function gcpLoginCode(Request $request, Run $run, GcpSignIn $signIn): JsonResponse
    {
        abort_unless($run->subject === GcpSignIn::SUBJECT && $run->status === RunStatus::Running, 404);

        $validated = $request->validate(['code' => ['required', 'string', 'regex:/^[A-Za-z0-9_\/.\-]{8,512}$/']]);

        $signIn->submitCode($run, $validated['code']);

        return response()->json(['ok' => true]);
    }

    public function gcpProjects(GcpSignIn $signIn): JsonResponse
    {
        return response()->json(['projects' => $signIn->projects()]);
    }

    public function setGcpProject(Request $request, ToolLocator $locator): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'project_id' => ['required', 'string', 'regex:/^[a-z0-9-]+$/'],
        ]);

        $gcloudBin = $locator->find('gcloud');
        if ($gcloudBin !== null) {
            $locator->run([$gcloudBin, 'config', 'set', 'project', $validated['project_id']], 10);
        }

        return $request->expectsJson()
            ? response()->json(['ok' => $gcloudBin !== null])
            : back()->with('success', "Google Cloud project set to {$validated['project_id']}.");
    }
}
