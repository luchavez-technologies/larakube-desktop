import { useEffect, useState } from 'react';
import { sendJson } from '@/lib/http';
import { status as domainStatus } from '@/routes/domains';

export type AddressReadiness = {
    dns: { ready: boolean; detail: string } | null;
    https: { ready: boolean; detail: string } | null;
};

/**
 * Whether a freshly installed app's address works yet: DNS resolves and HTTPS answers with a valid
 * certificate (DomainProbe). Checks every 5s until both are ready, then stops. Null host: nothing to check.
 */
export function useAddressReadiness(host: string | null): AddressReadiness {
    const [state, setState] = useState<AddressReadiness>({
        dns: null,
        https: null,
    });

    useEffect(() => {
        if (!host) return;

        let alive = true;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const check = async () => {
            const res = await sendJson<{
                dns: { ready: boolean; detail: string };
                https: { ready: boolean; detail: string };
            }>(domainStatus({ query: { host } }).url, 'GET');

            if (!alive) return;

            if (res.ok) {
                setState({ dns: res.data.dns, https: res.data.https });

                if (res.data.dns.ready && res.data.https.ready) {
                    return;
                }
            }

            timer = setTimeout(() => void check(), 5000);
        };

        void check();

        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
    }, [host]);

    return state;
}
