import { cn } from '@/lib/utils';

export function fieldInputClass(
    isInvalid: boolean | undefined,
    baseClass: string,
): string {
    return cn(
        baseClass,
        isInvalid && 'border-accent focus:border-accent focus:ring-accent',
    );
}

export default function FieldError({ message }: { message?: string | null }) {
    if (!message) {
        return null;
    }

    return (
        <p role="alert" className="mt-1 text-[11px] font-medium text-accent">
            {message}
        </p>
    );
}
