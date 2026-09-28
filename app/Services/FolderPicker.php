<?php

namespace App\Services;

use Native\Desktop\Dialog;

/** The native "choose a folder" dialog, behind a seam tests can replace. */
class FolderPicker
{
    public function pick(string $title): ?string
    {
        $path = Dialog::new()->title($title)->folders()->open();

        return is_string($path) && $path !== '' ? $path : null;
    }
}
