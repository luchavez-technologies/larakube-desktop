<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Pennant Store
    |--------------------------------------------------------------------------
    |
    | Here you will specify the default store that Pennant should use when
    | storing and resolving feature flag values. Pennant ships with the
    | ability to store flag values in an in-memory array or database.
    |
    | Supported: "array", "database"
    |
    */

    // Every feature this app defines is a static, code-shipped editorial call
    // (e.g. "has the team finished testing WordPress yet"), never a per-user
    // rollout — the array driver re-evaluates fresh every request, so a later
    // app update flipping a flag takes effect immediately. The database
    // driver would instead cache the first-resolved value per install
    // forever, since nothing here ever purges it.
    'default' => env('PENNANT_STORE', 'array'),

    /*
    |--------------------------------------------------------------------------
    | Pennant Stores
    |--------------------------------------------------------------------------
    |
    | Here you may configure each of the stores that should be available to
    | Pennant. These stores shall be used to store resolved feature flag
    | values - you may configure as many as your application requires.
    |
    */

    'stores' => [

        'array' => [
            'driver' => 'array',
        ],

        'database' => [
            'driver' => 'database',
            'connection' => null,
            'table' => 'features',
        ],

    ],
];
