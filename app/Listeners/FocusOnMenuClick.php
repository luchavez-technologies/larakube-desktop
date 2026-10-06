<?php

namespace App\Listeners;

use Native\Desktop\Events\Menu\MenuItemClicked;
use Native\Desktop\Facades\Window;

/** Reopens or focuses the main LaraKube window when the tray menu item is clicked. */
class FocusOnMenuClick
{
    public function handle(MenuItemClicked $event): void
    {
        $label = $event->item['label'] ?? null;
        $url = $event->item['url'] ?? null;

        if ($label === 'Open LaraKube' || $url === url('/')) {
            Window::open('main')
                ->title(config('app.name', 'LaraKube'))
                ->width(1180)
                ->height(780)
                ->minWidth(960)
                ->minHeight(640)
                ->rememberState();
        }
    }
}
