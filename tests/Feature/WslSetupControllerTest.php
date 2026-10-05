<?php

test('the Windows setup steps do not exist outside Windows', function () {
    $this->post('/setup/wsl/download')->assertNotFound();
});

test('only the known setup steps are routed', function () {
    $this->post('/setup/wsl/format-disk')->assertNotFound();
});
