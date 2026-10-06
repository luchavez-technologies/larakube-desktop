<?php

use App\Listeners\FocusOnMenuClick;
use Native\Desktop\Events\Menu\MenuItemClicked;
use Native\Desktop\Facades\Window;

test('clicking the Open LaraKube menu item reopens the main window', function () {
    Window::shouldReceive('open')
        ->with('main')
        ->once()
        ->andReturnSelf();
    Window::shouldReceive('title')->once()->andReturnSelf();
    Window::shouldReceive('width')->once()->andReturnSelf();
    Window::shouldReceive('height')->once()->andReturnSelf();
    Window::shouldReceive('minWidth')->once()->andReturnSelf();
    Window::shouldReceive('minHeight')->once()->andReturnSelf();
    Window::shouldReceive('rememberState')->once()->andReturnSelf();

    $listener = new FocusOnMenuClick;
    $listener->handle(new MenuItemClicked(['label' => 'Open LaraKube']));
});

test('unrelated menu items do not trigger main window opening', function () {
    Window::shouldReceive('open')->never();

    $listener = new FocusOnMenuClick;
    $listener->handle(new MenuItemClicked(['label' => 'Other Item']));
});
