<?php

namespace App\Services;

use Native\Desktop\Dialog;

/** The native "choose a folder" dialog, behind a seam tests can replace. */
class FolderPicker
{
    public function pick(string $title, ?string $defaultPath = null): ?string
    {
        try {
            $dialog = Dialog::new()->title($title)->folders();

            if ($defaultPath !== null && $defaultPath !== '' && is_dir($defaultPath)) {
                $dialog->defaultPath($defaultPath);
            }

            $path = $dialog->open();

            return is_string($path) && $path !== '' ? $path : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
