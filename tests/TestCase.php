<?php

namespace Tests;

use App\Services\LaraKube\ToolLocator;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\File;

abstract class TestCase extends BaseTestCase
{
    private ?string $originalHome = null;

    private ?string $sandboxHome = null;

    /**
     * Every test starts on an empty computer: no CLI, no tools, an empty home
     * folder. A test that needs one installs it itself, so results never depend
     * on what happens to be on the machine running them (a developer's laptop
     * has the CLI; CI does not).
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        $this->originalHome = $_SERVER['HOME'] ?? null;
        $this->sandboxHome = storage_path('framework/testing/sandbox-'.bin2hex(random_bytes(6)));
        File::ensureDirectoryExists($this->sandboxHome);
        $_SERVER['HOME'] = realpath($this->sandboxHome);

        app()->instance(ToolLocator::class, new ToolLocator([]));
    }

    protected function tearDown(): void
    {
        if ($this->originalHome === null) {
            unset($_SERVER['HOME']);
        } else {
            $_SERVER['HOME'] = $this->originalHome;
        }

        if ($this->sandboxHome !== null) {
            File::deleteDirectory($this->sandboxHome);
        }

        parent::tearDown();
    }
}
