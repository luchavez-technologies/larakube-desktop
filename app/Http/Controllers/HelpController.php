<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class HelpController extends Controller
{
    public function show(): Response
    {
        return Inertia::render('help/index');
    }
}
