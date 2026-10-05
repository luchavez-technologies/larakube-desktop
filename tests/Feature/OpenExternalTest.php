<?php

use Native\Desktop\Facades\Shell;

test('a long sign-in address is opened in the browser', function () {
    $url = 'https://accounts.google.com/o/oauth2/auth?'.str_repeat('scope=a&', 120).'code_challenge=abc';
    expect(strlen($url))->toBeGreaterThan(900);

    Shell::shouldReceive('openExternal')->once()->with($url);

    $this->post('/open', ['url' => $url])->assertRedirect();
});

test('plain http is only opened for this computer', function () {
    Shell::shouldReceive('openExternal')->never();

    $this->post('/open', ['url' => 'http://example.com/'])->assertStatus(422);
});

test('a caller that keeps its own page state gets JSON back, not a redirect', function () {
    Shell::shouldReceive('openExternal')->once()->with('https://example.com/a');

    $this->postJson('/open', ['url' => 'https://example.com/a'])->assertOk()->assertJson(['ok' => true]);
});
