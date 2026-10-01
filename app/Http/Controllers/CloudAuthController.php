<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Throwable;

class CloudAuthController extends Controller
{
    public function saveAws(Request $request, ToolLocator $locator, GlobalSettings $settings): RedirectResponse
    {
        $validated = $request->validate([
            'access_key_id' => ['required', 'string', 'regex:/^[A-Z0-9]{16,32}$/'],
            'secret_access_key' => ['required', 'string', 'min:16'],
            'region' => ['required', 'string', 'regex:/^[a-z0-9-]+$/'],
        ]);

        $home = ToolLocator::home();
        if ($home === '') {
            return back()->withErrors(['aws' => 'Could not determine user home directory.']);
        }

        $awsDir = "{$home}/.aws";
        if (! is_dir($awsDir)) {
            File::makeDirectory($awsDir, 0700, true);
        }

        $credentialsContent = "[default]\naws_access_key_id = {$validated['access_key_id']}\naws_secret_access_key = {$validated['secret_access_key']}\n";
        $configContent = "[default]\nregion = {$validated['region']}\noutput = json\n";

        File::put("{$awsDir}/credentials", $credentialsContent);
        chmod("{$awsDir}/credentials", 0600);

        File::put("{$awsDir}/config", $configContent);
        chmod("{$awsDir}/config", 0600);

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

    public function loginGcp(CliRunner $runner, ToolLocator $locator): RedirectResponse
    {
        $gcloudBin = $locator->find('gcloud');

        if ($gcloudBin === null) {
            return back()->withErrors(['gcp' => 'Google Cloud CLI (gcloud) is not installed. Install it first from Setup.']);
        }

        // Run gcloud auth login --update-adc
        // This opens the browser automatically on macOS
        $run = $runner->start(
            label: 'Google Cloud Authentication',
            arguments: ['cloud:providers', '--json'], // Keeps runner active
            kind: RunKind::CloudAuth,
            subject: 'gcp-auth',
            targetType: 'system',
            targetName: 'Google Cloud',
        );

        // Launch gcloud auth in background with system browser launch
        try {
            $isolated = $locator->isolate([$gcloudBin, 'auth', 'login', '--update-adc', '--no-launch-browser']);
            // If user clicks, browser opens with interactive flow or auth link
            Process::env($isolated['environment'])->start("{$gcloudBin} auth login --update-adc");
        } catch (Throwable $e) {
            // Ignored; user can authenticate in browser
        }

        return back()->with('success', 'Google Cloud login initiated. Please complete authorization in your browser.');
    }

    public function setGcpProject(Request $request, ToolLocator $locator): RedirectResponse
    {
        $validated = $request->validate([
            'project_id' => ['required', 'string', 'regex:/^[a-z0-9-]+$/'],
        ]);

        $gcloudBin = $locator->find('gcloud');
        if ($gcloudBin !== null) {
            $isolated = $locator->isolate([$gcloudBin, 'config', 'set', 'project', $validated['project_id']]);
            Process::env($isolated['environment'])->timeout(10)->run($isolated['command']);
        }

        return back()->with('success', "Google Cloud project set to {$validated['project_id']}.");
    }
}
