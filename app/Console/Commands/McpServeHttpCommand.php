<?php

namespace App\Console\Commands;

use App\Services\LaraKube\GlobalSettings;
use App\Services\Mcp\McpHttpServer;
use Illuminate\Console\Command;
use Throwable;

class McpServeHttpCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'mcp:serve-http
                            {--port= : Port to listen on (defaults to configured port)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Start the persistent MCP HTTP socket server for LaraKube Desktop';

    /**
     * Execute the console command.
     */
    public function handle(GlobalSettings $settings): int
    {
        $config = $settings->mcpHttp();
        $token = $config['token'];

        if (! is_string($token) || $token === '') {
            $this->error('No MCP HTTP bearer token configured.');

            return self::FAILURE;
        }

        $portOption = $this->option('port');
        $port = is_numeric($portOption) ? (int) $portOption : $config['port'];
        $allowEdits = $config['allowEdits'];

        $server = new McpHttpServer($token, $allowEdits);

        try {
            $server->listen($port);
        } catch (Throwable $e) {
            $this->error("Failed to start MCP HTTP server: {$e->getMessage()}");

            return self::FAILURE;
        }

        $this->info("MCP HTTP server listening on tcp://127.0.0.1:{$port} (allowEdits: ".($allowEdits ? 'true' : 'false').')');

        if (function_exists('pcntl_async_signals') && function_exists('pcntl_signal')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, function () use ($server): void {
                $server->stop();
                $server->close();
            });
            pcntl_signal(SIGINT, function () use ($server): void {
                $server->stop();
                $server->close();
            });
        }

        $server->run();
        $server->close();

        return self::SUCCESS;
    }
}
