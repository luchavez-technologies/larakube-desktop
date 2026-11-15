<?php

namespace App\Support;

/**
 * The label keys Desktop reads straight off the cluster. Mirrors the CLI's
 * `App\Support\Labels` (cli/app/Support/Labels.php), which owns them: change
 * the prefix there and here together.
 */
final class LaraKubeLabels
{
    public const string PREFIX = 'luchtech.dev';

    public const string ACCESS_USER = self::PREFIX.'/access-user';

    public const string PERSON = self::PREFIX.'/person';

    public const string ROLE = self::PREFIX.'/role';

    public const string PREVIEW = self::PREFIX.'/preview';
}
