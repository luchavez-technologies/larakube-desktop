<?php

return [

    /*
    | The LaraKube Linux image Windows imports as the `larakube-ubuntu` WSL distro. Published by the
    | larakube-ubuntu repo; `releases/latest/download/` replaces the canary URL after its first stable release.
    */
    'rootfs_url' => env('LARAKUBE_ROOTFS_URL', 'https://github.com/luchavez-technologies/larakube-ubuntu/releases/download/canary/larakube-ubuntu-amd64.tar.gz'),

];
