<?php

test('NSIS customUnInstall guards ~/.larakube and WSL deletion inside IfNot Silent', function () {
    $script = file_get_contents(base_path('nativephp/electron/build/installer.nsh'));

    expect($script)->toBeString();

    $ifPos = strpos($script, '${IfNot} ${Silent}');
    $rmdirPos = strpos($script, 'RMDir /r "$PROFILE\\.larakube"');
    $endIfPos = strrpos($script, '${EndIf}');

    expect($ifPos)->not->toBeFalse()
        ->and($rmdirPos)->not->toBeFalse()
        ->and($endIfPos)->not->toBeFalse()
        ->and($ifPos)->toBeLessThan($rmdirPos)
        ->and($rmdirPos)->toBeLessThan($endIfPos);
});
