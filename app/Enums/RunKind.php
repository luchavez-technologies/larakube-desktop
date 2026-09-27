<?php

namespace App\Enums;

enum RunKind: string
{
    case CreateServer = 'create-server';
    case DestroyServer = 'destroy-server';
    case InstallTool = 'install-tool';
}
