<?php

test('the home route opens the dashboard', function () {
    $this->get(route('home'))->assertOk();
});
