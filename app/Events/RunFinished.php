<?php

namespace App\Events;

use App\Models\Run;
use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A LaraKube CLI run reached its final status (succeeded, failed or
 * cancelled), saved before this fires.
 * Carries identifiers only (ADR 0021): pages reload their own props.
 */
class RunFinished
{
    use Dispatchable;

    public readonly int $run;

    public readonly ?string $kind;

    public readonly string $status;

    public readonly ?string $server;

    public readonly ?int $project;

    public function __construct(Run $run)
    {
        $this->run = $run->id;
        $this->kind = $run->kind?->value;
        $this->status = $run->status->value;
        $this->server = $run->server_name;
        $this->project = $run->project_id;
    }

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('nativephp')];
    }
}
