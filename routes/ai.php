<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use Laravel\Mcp\Facades\Mcp;

Mcp::local('desktop', LaraKubeDesktopServer::class);
