/** Injectable time source so expiry logic is testable without fake timers. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
