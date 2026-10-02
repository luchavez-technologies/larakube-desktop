<?php

test('the home route sends a computer without the CLI to Setup', function () {
    $this->get(route('home'))->assertRedirect(route('readiness'));
});
