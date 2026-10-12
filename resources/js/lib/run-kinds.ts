/** Run kinds whose success is worth celebrating with confetti — shared by the
 * full run page and the floating Activity HUD so both agree. */
export function celebratesOnSuccess(kind: string | null): boolean {
    return (
        kind === 'create-server' ||
        kind === 'create-dev-box' ||
        kind === 'new-project' ||
        kind === 'new-dev-box-project' ||
        kind === 'clone-project' ||
        kind === 'clone-dev-box-project'
    );
}
