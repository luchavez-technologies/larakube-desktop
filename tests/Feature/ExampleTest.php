<?php

test('the home route opens the setup screen', function () {
    $this->get(route('home'))->assertRedirect(route('readiness'));
});
