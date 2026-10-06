<?php

namespace App\Services;

use Native\Desktop\Dialog;

/** The native "choose a file" dialog, behind a seam tests can replace. */
class FilePicker
{
    /**
     * @param  list<string>  $extensions
     */
    public function pick(string $title, array $extensions = ['yaml', 'yml', 'conf', 'config'], ?string $filterName = null): ?string
    {
        try {
            $dialog = Dialog::new()->title($title)->files();

            if (! empty($extensions)) {
                $dialog->filter($filterName ?? 'Configuration Files', $extensions);
            }

            $path = $dialog->open();

            return is_string($path) && $path !== '' ? $path : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
