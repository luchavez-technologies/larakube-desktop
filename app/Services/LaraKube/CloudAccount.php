<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;

/**
 * Cloud sign-in and keys, done by the LaraKube CLI (`cloud:projects`, `cloud:project`, `cloud:credentials`). Desktop only
 * asks and shows the answer; secrets go in the environment, never in a command line.
 */
class CloudAccount
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @param  list<string>  $arguments
     * @param  array<string, string>  $environment
     * @return array<string, mixed> the CLI's one JSON result, or ['success' => false, 'error' => ...]
     */
    public function call(array $arguments, array $environment = [], int $timeout = 60): array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return ['success' => false, 'error' => 'The LaraKube CLI is not installed.'];
        }

        try {
            $result = $this->locator->run([$cli, ...$arguments, '--json', '--no-interaction'], $timeout, $environment);
        } catch (ProcessTimedOutException) {
            return ['success' => false, 'error' => 'The LaraKube CLI took too long to answer.'];
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (is_array($decoded)) {
            return $decoded;
        }

        $text = trim($result->errorOutput().' '.$result->output());

        return ['success' => false, 'error' => str_contains($text, 'is not defined') ? 'This LaraKube CLI is too old for that. Update it, then try again.' : ($text ?: 'The LaraKube CLI did not answer.')];
    }
}
