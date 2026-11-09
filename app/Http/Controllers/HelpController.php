<?php

namespace App\Http\Controllers;

use App\Services\Help\HowToVideosClient;
use Inertia\Inertia;
use Inertia\Response;

class HelpController extends Controller
{
    public function show(HowToVideosClient $videos): Response
    {
        return Inertia::render('help/index', [
            'howToVideos' => Inertia::defer(fn () => $videos->getVideos()),
        ]);
    }
}
