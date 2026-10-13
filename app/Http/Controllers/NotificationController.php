<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;

class NotificationController extends Controller
{
    public function markAsRead(string $id): RedirectResponse
    {
        $notification = User::defaultUser()->notifications()->where('id', $id)->first();
        $notification?->markAsRead();

        return back();
    }

    public function markAllAsRead(): RedirectResponse
    {
        User::defaultUser()->unreadNotifications->markAsRead();

        return back();
    }

    public function destroy(string $id): RedirectResponse
    {
        $notification = User::defaultUser()->notifications()->where('id', $id)->first();
        $notification?->delete();

        return back();
    }
}
