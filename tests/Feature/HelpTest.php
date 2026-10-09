<?php

use Inertia\Testing\AssertableInertia;

test('the help page renders its own component, separate from settings', function () {
    $this->get(route('help.show'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page->component('help/index'));
});
