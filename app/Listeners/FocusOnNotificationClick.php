<?php

namespace App\Listeners;

use Native\Desktop\Events\Notifications\NotificationClicked;
use Native\Desktop\Facades\Window;

/** A clicked notification brings the app to the front; the page it opens is chosen by the window itself. */
class FocusOnNotificationClick
{
    public function handle(NotificationClicked $event): void
    {
        if (str_starts_with($event->reference, 'run:') || $event->reference === 'update') {
            Window::open('main');
        }
    }
}
