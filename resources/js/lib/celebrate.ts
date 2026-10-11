import confetti from 'canvas-confetti';

/** The one confetti burst used everywhere something worth celebrating just finished. */
export function celebrate(): void {
    void confetti({
        particleCount: 90,
        spread: 70,
        startVelocity: 32,
        origin: { y: 0.6 },
        colors: ['#5683e0', '#2c9fc0', '#8457e0', '#15803d'],
    });
}
