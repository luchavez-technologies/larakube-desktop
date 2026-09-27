<?php

namespace App\Models;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * One invocation of the LaraKube CLI, driven as a NativePHP child process.
 * Human-readable progress (the CLI's stderr under --json) accumulates in
 * `output`; stdout is reserved for the single --json result line.
 *
 * @property int $id
 * @property string $label
 * @property RunKind|null $kind
 * @property string|null $subject
 * @property array<string, string>|null $meta
 * @property list<string> $command
 * @property RunStatus $status
 * @property int|null $exit_code
 * @property string $output
 * @property string $stdout
 * @property array<string, mixed>|null $result
 * @property CarbonImmutable|null $finished_at
 * @property CarbonImmutable|null $created_at
 */
class Run extends Model
{
    protected $fillable = ['label', 'kind', 'subject', 'meta', 'command', 'status', 'exit_code', 'output', 'stdout', 'result', 'finished_at'];

    protected $attributes = [
        'status' => 'running',
        'output' => '',
        'stdout' => '',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'command' => 'array',
            'kind' => RunKind::class,
            'meta' => 'array',
            'status' => RunStatus::class,
            'result' => 'array',
            'finished_at' => 'datetime',
        ];
    }

    /** Under --json the CLI keeps stdout for one result line; otherwise stdout IS the log. */
    public function emitsJsonResult(): bool
    {
        return in_array('--json', $this->command, true);
    }

    /** The NativePHP child-process alias for this run. */
    public function alias(): string
    {
        return "run-{$this->id}";
    }

    public static function idFromAlias(string $alias): ?int
    {
        return preg_match('/^run-(\d+)$/', $alias, $matches) === 1 ? (int) $matches[1] : null;
    }

    /**
     * Append in a single UPDATE so output chunks arriving on concurrent
     * event requests never overwrite each other.
     */
    public function appendTo(string $column, string $chunk): void
    {
        $sql = match ($column) {
            'output' => 'update runs set output = output || ? where id = ?',
            'stdout' => 'update runs set stdout = stdout || ? where id = ?',
            default => throw new InvalidArgumentException("Cannot append to column [{$column}]."),
        };

        DB::update($sql, [$chunk, $this->id]);
    }
}
