<?php

use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // NativePHP posts child-process output chunks back as events; trimming
        // them strips the newlines the run log and the --json result rely on.
        $isNativeEvent = fn (Request $request): bool => $request->is('_native/api/events');
        $middleware->trimStrings(except: [$isNativeEvent]);
        $middleware->convertEmptyStringsToNull(except: [$isNativeEvent]);

        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Which request failed, and whether it carried NativePHP's secret (never its value), so a 403 can be traced to its caller.
        $exceptions->context(fn (): array => app()->runningInConsole() ? [] : [
            'request' => request()->method().' '.request()->path(),
            'native_cookie' => request()->hasCookie('_php_native'),
            'native_header' => request()->hasHeader('X-NativePHP-Secret'),
        ]);

        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
