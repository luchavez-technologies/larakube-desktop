import type { SimulatorHop, SimulatorScenario } from './types';

export function getScenarios(
    host: string = 'app.dev.test',
    framework: string = 'laravel',
    databaseDriver?: string | null,
    databaseName?: string | null,
): Record<string, SimulatorScenario> {
    const fw = (framework || 'laravel').toLowerCase();
    const isStatic =
        [
            'docusaurus',
            'vite',
            'react',
            'vue',
            'static',
            'html',
            'astro',
        ].includes(fw) ||
        !databaseDriver ||
        databaseDriver === 'none';

    const runtime =
        fw === 'laravel'
            ? 'FrankenPHP Octane'
            : fw === 'wordpress'
              ? 'WordPress (PHP-FPM)'
              : fw === 'pocketbase'
                ? 'PocketBase (Go)'
                : isStatic
                  ? 'Static Web Server (NGINX)'
                  : `${framework} Runtime`;

    const podTitle =
        fw === 'laravel'
            ? 'Laravel App'
            : fw === 'docusaurus'
              ? 'Docusaurus Docs'
              : fw === 'wordpress'
                ? 'WordPress'
                : fw === 'pocketbase'
                  ? 'PocketBase'
                  : 'App Workload';

    const baseHops = {
        client: (
            path: string,
            method: string = 'GET',
            extraHeaders?: Record<string, string>,
        ): SimulatorHop => ({
            id: 'client',
            title: 'User Browser',
            subtitle: 'Client Request',
            layer: 'Layer 7',
            icon: 'Laptop',
            badge: 'Origin',
            summary: `User initiates ${method} request to https://${host}${path}`,
            mechanics: [
                `Browser resolves domain "${host}" via DNS or /etc/hosts.`,
                'Initiates TCP three-way handshake (SYN → SYN-ACK → ACK).',
                'Negotiates TLS 1.3 cryptographic session key.',
            ],
            technicalDetails: {
                protocol: 'HTTP/2 (TLS)',
                port: '443',
                headers: {
                    Host: host,
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                    Accept: 'text/html,application/xhtml+xml,application/json',
                    'Sec-Fetch-Mode': 'navigate',
                    ...extraHeaders,
                },
                latencyMs: 1,
            },
        }),

        dns: (statusText: string = 'Proxy Active'): SimulatorHop => ({
            id: 'dns',
            title: 'Cloudflare Edge',
            subtitle: 'DNS, TLS & WAF',
            layer: 'Edge CDN',
            icon: 'Shield',
            badge: statusText,
            summary:
                'Edge proxy inspects incoming packet, terminates public TLS, and enforces WAF security rules.',
            mechanics: [
                'Validates SNI matching certificate.',
                'Checks IP reputation, DDoS flood limits, and bot mitigation rules.',
                'Proxies traffic via HTTP/2 or HTTP/3 to cluster public ingress IP.',
            ],
            technicalDetails: {
                protocol: 'TLS 1.3',
                port: '443',
                headers: {
                    'CF-Ray': '8d4f2910a7bc-SIN',
                    'CF-Connecting-IP': '203.0.113.195',
                    'X-Forwarded-Proto': 'https',
                },
                latencyMs: 12,
            },
        }),

        ingress: (rule: string): SimulatorHop => ({
            id: 'ingress',
            title: 'Traefik Ingress',
            subtitle: 'Gateway & Router',
            layer: 'Ingress',
            icon: 'Network',
            badge: 'Traefik v3',
            summary: `Traefik evaluates IngressRoute rules for Host(\`${host}\`) and proxies to internal Service.`,
            mechanics: [
                'Traefik receives packet on NodePort 80/443.',
                `Matches CRD IngressRoute rule: "${rule}".`,
                'Forwards request internally to the Kubernetes ClusterIP virtual IP.',
            ],
            technicalDetails: {
                protocol: 'HTTP/1.1',
                port: '80',
                headers: {
                    'X-Forwarded-For': '203.0.113.195',
                    'X-Forwarded-Host': host,
                    'X-Real-IP': '10.42.0.1',
                },
                latencyMs: 3,
            },
        }),

        service: (
            serviceName: string,
            targetPort: number = 80,
        ): SimulatorHop => ({
            id: 'service',
            title: 'K8s Service',
            subtitle: 'ClusterIP Load Balancer',
            layer: 'Service',
            icon: 'Layers',
            badge: 'ClusterIP',
            summary: `Virtual IP (${serviceName}) balances request across active healthy container pods.`,
            mechanics: [
                'Kube-proxy / eBPF resolves internal DNS service name.',
                'Inspects active Endpoints slice for ready pod IPs.',
                'Performs round-robin load distribution across pod replicas.',
            ],
            technicalDetails: {
                protocol: 'TCP',
                port: String(targetPort),
                latencyMs: 1,
            },
        }),

        pod: (
            action: string,
            status: number = 200,
            extraDetails?: Partial<SimulatorHop['technicalDetails']>,
        ): SimulatorHop => ({
            id: 'pod',
            title: podTitle,
            subtitle: runtime,
            layer: 'Pod',
            icon: 'Cpu',
            badge: `${status} OK`,
            summary: action,
            mechanics: isStatic
                ? [
                      'NGINX worker process receives HTTP socket request.',
                      'Matches request URI to static files in document root (/usr/share/nginx/html).',
                      'Reads pre-compiled static bundle from filesystem cache into output stream.',
                  ]
                : [
                      `${runtime} worker process receives request from socket.`,
                      'Bootstraps framework kernel (Routing, Middleware, Providers).',
                      'Executes Controller action and serializes response payload.',
                  ],
            technicalDetails: {
                protocol: isStatic ? 'HTTP/1.1' : 'FastCGI',
                port: '80',
                payload:
                    status === 200
                        ? isStatic
                            ? 'Static HTML/JS/CSS Bundle'
                            : 'HTML / JSON Response Body'
                        : 'Exception Stack Trace',
                responseCode: status,
                latencyMs: isStatic ? 2 : 16,
                ...extraDetails,
            },
        }),
    };

    // If static site (Docusaurus, Vite, React, Vue, Static HTML), no database exists!
    if (isStatic) {
        return {
            healthy_web: {
                id: 'healthy_web',
                name: 'Static Web Page (HTTP 200 OK)',
                description:
                    'Serves pre-compiled HTML, JavaScript, and CSS bundle directly from web server disk cache.',
                statusCode: 200,
                tone: 'ok',
                hops: [
                    baseHops.client('/'),
                    baseHops.dns('Edge TLS OK'),
                    baseHops.ingress(`Host(\`${host}\`) && PathPrefix(\`/\`)`),
                    baseHops.service('web-service', 80),
                    baseHops.pod(
                        'Web server resolves URL to compiled static bundle (/index.html) and returns directly from cache.',
                        200,
                    ),
                ],
            },

            cached_asset: {
                id: 'cached_asset',
                name: 'Cache Revalidation (HTTP 304 Not Modified)',
                description:
                    'Browser sends ETag header; web server validates file hash and returns 304 with 0 bytes transferred.',
                statusCode: 304,
                tone: 'ok',
                hops: [
                    baseHops.client('/assets/index.js', 'GET', {
                        'If-None-Match': 'W/"65bf20b4-3a2e"',
                    }),
                    baseHops.dns('Edge Cache HIT'),
                    baseHops.ingress(`Host(\`${host}\`)`),
                    baseHops.service('web-service', 80),
                    baseHops.pod(
                        'Web server compares ETag hash with disk mtime. Content is unchanged; returns 304 Not Modified.',
                        304,
                        {
                            payload: '0 bytes (Not Modified)',
                            responseCode: 304,
                            latencyMs: 1,
                        },
                    ),
                ],
            },

            fault_pod: {
                id: 'fault_pod',
                name: 'Pod Crash / 0 Replicas (HTTP 502 Bad Gateway)',
                description:
                    'Simulates what happens when container crashes or pod replicas are unavailable.',
                statusCode: 502,
                tone: 'bad',
                hops: [
                    baseHops.client('/'),
                    baseHops.dns('Edge Active'),
                    {
                        id: 'ingress',
                        title: 'Traefik Ingress',
                        subtitle: 'No Endpoints Available',
                        layer: 'Ingress',
                        icon: 'Network',
                        badge: '502 Bad Gateway',
                        summary:
                            'Traefik finds 0 healthy endpoints in K8s Endpoints slice and returns 502 Bad Gateway.',
                        mechanics: [
                            'Traefik attempts to proxy request to target Service ClusterIP.',
                            'Service endpoints slice is empty because pod is down or failed health checks.',
                            'Traefik immediately returns 502 Bad Gateway error page to client.',
                        ],
                        technicalDetails: {
                            protocol: 'HTTP/1.1',
                            port: '80',
                            responseCode: 502,
                            latencyMs: 25,
                        },
                    },
                ],
            },

            not_found: {
                id: 'not_found',
                name: 'File Missing (HTTP 404 Not Found)',
                description:
                    'Requested file does not exist on disk; web server returns 404.',
                statusCode: 404,
                tone: 'warn',
                hops: [
                    baseHops.client('/missing-doc-page'),
                    baseHops.dns('Edge Active'),
                    baseHops.ingress(`Host(\`${host}\`)`),
                    baseHops.service('web-service', 80),
                    {
                        ...baseHops.pod(
                            'Static file not found in document root. Web server returns 404 Not Found.',
                            404,
                        ),
                        badge: '404 Not Found',
                    },
                ],
            },
        };
    }

    // Backend application with Database (Laravel, WordPress, PocketBase)
    const isPostgres = databaseDriver === 'pgsql';
    const isSqlite = databaseDriver === 'sqlite';
    const dbPort = isPostgres ? '5432' : isSqlite ? 'Local PVC' : '3306';
    const dbTitle = isPostgres
        ? 'PostgreSQL 16'
        : isSqlite
          ? 'SQLite 3'
          : 'MySQL 8';
    const dbSubtitle = databaseName || (isSqlite ? 'data.sqlite' : 'tenant_db');

    const databaseHop = (
        query: string,
        status: string = 'Active',
    ): SimulatorHop => ({
        id: 'database',
        title: dbTitle,
        subtitle: isSqlite ? dbSubtitle : `Plex Commons (${dbSubtitle})`,
        layer: 'Database',
        icon: 'Database',
        badge: status,
        summary: isSqlite
            ? `Reads SQLite database file from PersistentVolumeClaim (PVC) block storage.`
            : `Executes SQL query over TCP socket to shared ${dbTitle} pod in larakube-plex.`,
        mechanics: isSqlite
            ? [
                  'Opens SQLite database file with WAL (Write-Ahead Logging) mode.',
                  'Reads indexed B-Tree pages directly from local storage volume.',
                  'Zero TCP socket latency; no external database container overhead.',
              ]
            : [
                  `Connects to backing engine via PDO driver "${databaseDriver}".`,
                  'Authenticates via credentials injected from OpenBao Vault or .env.',
                  'Scans B-Tree indexes and reads block storage from PersistentVolumeClaim (PVC).',
              ],
        technicalDetails: {
            protocol: isSqlite ? 'SQLite File' : `${dbTitle} TCP`,
            port: dbPort,
            query: query,
            latencyMs: isSqlite ? 1 : 4,
        },
    });

    return {
        healthy_web: {
            id: 'healthy_web',
            name: 'Web Request (HTTP 200 OK)',
            description:
                'Full request cycle: auth validation, database query, and HTML view rendering.',
            statusCode: 200,
            tone: 'ok',
            hops: [
                baseHops.client('/dashboard'),
                baseHops.dns('Edge TLS OK'),
                baseHops.ingress(`Host(\`${host}\`) && PathPrefix(\`/\`)`),
                baseHops.service('web-service', 80),
                baseHops.pod(
                    'Application bootstraps, validates user session, and queries database.',
                    200,
                ),
                databaseHop(
                    'SELECT * FROM users WHERE active = true ORDER BY created_at DESC LIMIT 20;',
                ),
            ],
        },

        healthy_api: {
            id: 'healthy_api',
            name: 'API JSON Request (HTTP 200 OK)',
            description:
                'High-speed REST API request querying database and serializing JSON payload.',
            statusCode: 200,
            tone: 'ok',
            hops: [
                baseHops.client('/api/v1/projects', 'GET'),
                baseHops.dns('WAF Clean'),
                baseHops.ingress(`Host(\`${host}\`) && PathPrefix(\`/api\`)`),
                baseHops.service('api-service', 80),
                baseHops.pod(
                    'API Controller validates token, queries database, and serializes JSON.',
                    200,
                ),
                databaseHop(
                    'SELECT id, name, framework, status FROM projects WHERE tenant_id = 14;',
                ),
            ],
        },

        fault_database: {
            id: 'fault_database',
            name: 'DB Crash / Refused (HTTP 500)',
            description:
                'Simulates what happens when database pod is offline or credentials fail.',
            statusCode: 500,
            tone: 'bad',
            hops: [
                baseHops.client('/orders'),
                baseHops.dns('Edge Active'),
                baseHops.ingress(`Host(\`${host}\`)`),
                baseHops.service('web-service', 80),
                {
                    ...baseHops.pod(
                        'Application catches connection exception: Database connection refused.',
                        500,
                    ),
                    badge: '500 Error',
                },
                {
                    id: 'database',
                    title: dbTitle,
                    subtitle: 'Engine Down / Socket Closed',
                    layer: 'Database',
                    icon: 'AlertTriangle',
                    badge: 'ECONNREFUSED',
                    summary: `Connection to ${dbTitle} failed: Connection refused.`,
                    mechanics: [
                        'Application pod attempts TCP handshake to database service.',
                        'Target port is closed or database pod is restarting.',
                        'Driver throws connection exception and application renders 500 error page.',
                    ],
                    technicalDetails: {
                        protocol: 'TCP',
                        port: dbPort,
                        query: 'FAILED: Connection refused',
                        latencyMs: 1500,
                    },
                },
            ],
        },

        fault_pod: {
            id: 'fault_pod',
            name: 'Pod Crash / 0 Replicas (HTTP 502)',
            description:
                'Simulates an OOMKilled application pod or misconfigured container failing health checks.',
            statusCode: 502,
            tone: 'bad',
            hops: [
                baseHops.client('/api/v1/checkout'),
                baseHops.dns('Edge Active'),
                {
                    id: 'ingress',
                    title: 'Traefik Ingress',
                    subtitle: 'No Endpoints Available',
                    layer: 'Ingress',
                    icon: 'Network',
                    badge: '502 Bad Gateway',
                    summary:
                        'Traefik finds 0 healthy endpoints in K8s Endpoints slice and returns 502 Bad Gateway.',
                    mechanics: [
                        'Traefik attempts to proxy request to target Service ClusterIP.',
                        'Service endpoints slice is empty because all application pods are in CrashLoopBackOff or OOMKilled.',
                        'Traefik immediately returns 502 Bad Gateway error page to client.',
                    ],
                    technicalDetails: {
                        protocol: 'HTTP/1.1',
                        port: '80',
                        responseCode: 502,
                        latencyMs: 25,
                    },
                },
            ],
        },

        not_found: {
            id: 'not_found',
            name: 'Route Missing (HTTP 404)',
            description: 'Requested URI path does not match any route.',
            statusCode: 404,
            tone: 'warn',
            hops: [
                baseHops.client('/nonexistent-test-path'),
                baseHops.dns('Edge Active'),
                baseHops.ingress(`Host(\`${host}\`)`),
                baseHops.service('web-service', 80),
                {
                    ...baseHops.pod(
                        'Router evaluates all routes and finds no match. Returns 404.',
                        404,
                    ),
                    badge: '404 Not Found',
                },
            ],
        },
    };
}
