<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\GcpSignIn;
use App\Services\LaraKube\CloudAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use RuntimeException;

class CloudAuthController extends Controller
{
    public function saveAws(Request $request, CloudAccount $account): RedirectResponse
    {
        $validated = $request->validate([
            'access_key_id' => ['required', 'string', 'regex:/^[A-Z0-9]{16,32}$/'],
            'secret_access_key' => ['required', 'string', 'min:16'],
            'region' => ['required', 'string', 'regex:/^[a-z0-9-]+$/'],
            'profile' => ['nullable', 'string', 'regex:/^[a-zA-Z0-9._-]+$/'],
        ]);

        $arguments = ['cloud:credentials', '--provider=aws', "--region={$validated['region']}"];
        if (! empty($validated['profile'])) {
            $arguments[] = "--profile={$validated['profile']}";
        }

        $result = $account->call(
            $arguments,
            ['AWS_ACCESS_KEY_ID' => $validated['access_key_id'], 'AWS_SECRET_ACCESS_KEY' => $validated['secret_access_key']],
        );

        if (($result['success'] ?? false) !== true) {
            return back()->withErrors(['aws' => (string) ($result['error'] ?? 'Could not save the AWS credentials.')]);
        }

        if (($result['verified'] ?? null) === false) {
            return back()->withErrors(['aws' => 'AWS credentials saved, but AWS did not accept them. Check the keys.']);
        }

        return back()->with('success', 'AWS credentials saved'.(($result['verified'] ?? null) === true ? ' and verified' : '').'.');
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

    public function setGcpProject(Request $request, CloudAccount $account): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'project_id' => ['required', 'string', 'regex:/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/'],
        ]);

        $result = $account->call(['cloud:project', '--provider=gcp', "--project={$validated['project_id']}"]);
        $saved = ($result['success'] ?? false) === true;

        if ($request->expectsJson()) {
            return response()->json(['ok' => $saved, 'message' => $saved ? null : ($result['error'] ?? null)], $saved ? 200 : 422);
        }

        return $saved
            ? back()->with('success', "Google Cloud project set to {$validated['project_id']}.")
            : back()->withErrors(['gcp' => (string) ($result['error'] ?? 'Could not set the project.')]);
    }
}
