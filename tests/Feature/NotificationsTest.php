<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\User;
use App\Services\RunNotifier;
use Native\Desktop\Events\Notifications\NotificationClicked;
use Native\Desktop\Facades\Notification;
use Native\Desktop\Facades\Window;

function finishedRun(RunStatus $status, int $seconds, ?array $result = null): Run
{
    $run = Run::create(['label' => 'Create server demo', 'command' => ['larakube'], 'status' => $status, 'result' => $result]);
    $run->forceFill(['created_at' => now()->subSeconds($seconds), 'finished_at' => now()])->save();

    return $run->refresh();
}

test('a long run that succeeded tells the user, and clicking it opens the run', function () {
    $run = finishedRun(RunStatus::Succeeded, 70);

    Notification::shouldReceive('title')->once()->with('Create server demo finished')->andReturnSelf();
    Notification::shouldReceive('message')->once()->with('Finished in 1m 10s. Click to open.')->andReturnSelf();
    Notification::shouldReceive('reference')->once()->with("run:{$run->id}")->andReturnSelf();
    Notification::shouldReceive('show')->once();

    app(RunNotifier::class)->runFinished($run);
});

test('a long run that failed says why when the CLI said why', function () {
    $run = finishedRun(RunStatus::Failed, 45, ['success' => false, 'error' => 'No capacity in this region.']);

    Notification::shouldReceive('title')->once()->with('Create server demo failed')->andReturnSelf();
    Notification::shouldReceive('message')->once()->with('No capacity in this region.')->andReturnSelf();
    Notification::shouldReceive('reference')->once()->andReturnSelf();
    Notification::shouldReceive('show')->once();

    app(RunNotifier::class)->runFinished($run);
});

test('quick and cancelled runs stay quiet', function () {
    Notification::shouldReceive('title')->never();

    app(RunNotifier::class)->runFinished(finishedRun(RunStatus::Succeeded, 10));
    app(RunNotifier::class)->runFinished(finishedRun(RunStatus::Cancelled, 120));
});

test('a notification that cannot be shown never breaks the run that finished', function () {
    Notification::shouldReceive('title')->andThrow(new RuntimeException('no notification service'));

    app(RunNotifier::class)->runFinished(finishedRun(RunStatus::Succeeded, 90));

    expect(true)->toBeTrue();
});

test('clicking a notification brings the app window to the front', function () {
    Window::shouldReceive('open')->once()->with('main');

    event(new NotificationClicked('run:5', 'x'));
});

test('a finished run records a database notification for default user', function () {
    $run = finishedRun(RunStatus::Succeeded, 15);

    app(RunNotifier::class)->runFinished($run);

    $notification = User::defaultUser()->unreadNotifications()->first();
    expect($notification)->not->toBeNull()
        ->and($notification->data['run_id'])->toBe($run->id)
        ->and($notification->data['title'])->toBe('Create server demo');
});

test('individual database notification can be marked as read', function () {
    $run = finishedRun(RunStatus::Succeeded, 10);
    app(RunNotifier::class)->runFinished($run);

    $notification = User::defaultUser()->unreadNotifications()->first();
    expect($notification->read_at)->toBeNull();

    $this->post(route('notifications.read', $notification->id))
        ->assertRedirect();

    expect($notification->fresh()->read_at)->not->toBeNull();
});

test('all database notifications can be marked as read at once', function () {
    $run1 = finishedRun(RunStatus::Succeeded, 5);
    $run2 = finishedRun(RunStatus::Failed, 5);
    app(RunNotifier::class)->runFinished($run1);
    app(RunNotifier::class)->runFinished($run2);

    expect(User::defaultUser()->unreadNotifications()->count())->toBeGreaterThanOrEqual(2);

    $this->post(route('notifications.read-all'))
        ->assertRedirect();

    expect(User::defaultUser()->unreadNotifications()->count())->toBe(0);
});

test('database notification can be dismissed and deleted', function () {
    $run = finishedRun(RunStatus::Succeeded, 5);
    app(RunNotifier::class)->runFinished($run);

    $notification = User::defaultUser()->notifications()->first();

    $this->delete(route('notifications.destroy', $notification->id))
        ->assertRedirect();

    expect(User::defaultUser()->notifications()->where('id', $notification->id)->exists())->toBeFalse();
});
