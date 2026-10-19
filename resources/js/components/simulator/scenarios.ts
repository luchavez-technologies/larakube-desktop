import type { ScenarioKind, SimulatorHop, SimulatorScenario } from './types';

export function getScenarios(
    host: string = 'app.dev.test',
    framework: string = 'laravel',
    databaseDriver: string = 'pgsql',
    databaseName: string = 'tenant_db',
): Record<ScenarioKind, SimulatorScenario> {
    const isPostgres = databaseDriver === 'pgsql';
    const dbPort = isPostgres
        ? '5432'
        : databaseDriver === 'mysql'
          ? '3306'
          : 'Local File';
    const dbTitle = isPostgres
        ? 'PostgreSQL 16'
        : databaseDriver === 'mysql'
          ? 'MySQL 8'
          : 'SQLite Database';

    const baseHops = {
        client: (path: string, method: string = 'GET'): SimulatorHop => ({
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
                protocol: 'HTTPS / HTTP/2',
                port: '443',
                headers: {
                    Host: host,
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                    Accept: 'text/html,application/xhtml+xml,application/json',
                    'Sec-Fetch-Mode': 'navigate',
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
                protocol: 'TLS 1.3 / TCP',
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
                protocol: 'HTTP/1.1 (Internal CNI)',
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
                protocol: 'TCP / iptables',
                port: String(targetPort),
                latencyMs: 1,
            },
        }),

        pod: (
            runtime: string,
            action: string,
            status: number = 200,
        ): SimulatorHop => ({
            id: 'pod',
            title: framework === 'laravel' ? 'Laravel App' : 'App Workload',
            subtitle: runtime,
            layer: 'Pod',
            icon: 'Cpu',
            badge: `${status} OK`,
            summary: action,
            mechanics: [
                `${runtime} worker thread receives request from socket.`,
                'Bootstraps framework kernel (Service Providers, Routing, Middleware).',
                'Invokes Controller action and serializes response payload.',
            ],
            technicalDetails: {
                protocol: 'FastCGI / HTTP',
                port: '80',
                payload:
                    status === 200
                        ? 'HTML / JSON Response Body'
                        : 'Exception Stack Trace',
                responseCode: status,
                latencyMs: 16,
            },
        }),

        database: (query: string, status: string = 'Active'): SimulatorHop => ({
            id: 'database',
            title: dbTitle,
            subtitle: databaseName,
            layer: 'Database',
            icon: 'Database',
            badge: status,
            summary: `Executes SQL query over TCP socket on database "${databaseName}".`,
            mechanics: [
                `Connects to backing engine via PDO driver "${databaseDriver}".`,
                'Authenticates via credentials injected from OpenBao Vault or .env.',
                'Scans B-Tree indexes and reads block storage from PersistentVolumeClaim (PVC).',
            ],
            technicalDetails: {
                protocol:
                    databaseDriver === 'sqlite'
                        ? 'POSIX File IO'
                        : 'PostgreSQL Wire / TCP',
                port: dbPort,
                query: query,
                latencyMs: 4,
            },
        }),
    };

    return {
        healthy_web: {
            id: 'healthy_web',
            name: 'Standard Web Page (HTTP 200 OK)',
            description:
                'Full request flow rendering a dynamic view with database query execution and template compilation.',
            statusCode: 200,
            tone: 'ok',
            hops: [
                baseHops.client('/dashboard'),
                baseHops.dns('Edge TLS OK'),
                baseHops.ingress(`Host(\`${host}\`) && PathPrefix(\`/\`)`),
                baseHops.service('web-service', 80),
                baseHops.pod(
                    'FrankenPHP Octane',
                    'Laravel bootstraps, validates user session, and queries database.',
                    200,
                ),
                baseHops.database(
                    'SELECT * FROM users WHERE active = true ORDER BY created_at DESC LIMIT 20;',
                ),
            ],
        },

        healthy_api: {
            id: 'healthy_api',
            name: 'API JSON Endpoint (HTTP 200 / 201)',
            description:
                'High-speed REST/GraphQL API request processing JSON payload and executing indexed writes.',
            statusCode: 200,
            tone: 'ok',
            hops: [
                baseHops.client('/api/v1/projects', 'GET'),
                baseHops.dns('WAF Clean'),
                baseHops.ingress(`Host(\`${host}\`) && PathPrefix(\`/api\`)`),
                baseHops.service('api-service', 80),
                baseHops.pod(
                    'FrankenPHP Octane',
                    'API Controller executes query and serializes JsonResponse.',
                    200,
                ),
                baseHops.database(
                    'SELECT id, name, framework, status FROM projects WHERE tenant_id = 14;',
                ),
            ],
        },

        fault_database: {
            id: 'fault_database',
            name: 'Database Offline / Connection Refused (HTTP 500)',
            description:
                'Simulates what happens when a database engine pod crashes, restarts, or credentials fail.',
            statusCode: 500,
            tone: 'bad',
            hops: [
                baseHops.client('/orders'),
                baseHops.dns('Edge Active'),
                baseHops.ingress(`Host(\`${host}\`)`),
                baseHops.service('web-service', 80),
                {
                    ...baseHops.pod(
                        'FrankenPHP Octane',
                        'Laravel encounters uncaught PDOException: Connection refused (ECONNREFUSED).',
                        500,
                    ),
                    badge: '500 Error',
                },
                {
                    id: 'database',
                    title: `Plex Commons (${dbTitle})`,
                    subtitle: 'Engine Down / Socket Closed',
                    layer: 'Layer 7 • Persistence Storage',
                    icon: 'AlertTriangle',
                    badge: 'ECONNREFUSED',
                    summary: `PDO connection to ${isPostgres ? 'postgres:5432' : 'database'} failed: Connection refused.`,
                    mechanics: [
                        'Application pod attempts TCP handshake to database service.',
                        'Target port is closed or database pod is restarting.',
                        'PDO driver throws PDOException: SQLSTATE[08006] [7] could not connect to server.',
                        'Laravel exception handler catches error and renders 500 Server Error response.',
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
            name: 'Workload Unreachable / CrashLoopBackOff (HTTP 502)',
            description:
                'Simulates an OOMKilled application pod or misconfigured container failing health checks.',
            statusCode: 502,
            tone: 'bad',
            hops: [
                baseHops.client('/api/v1/checkout'),
                baseHops.dns('Edge Active'),
                {
                    id: 'ingress',
                    title: 'Traefik Ingress Controller',
                    subtitle: 'No Endpoints Available',
                    layer: 'Layer 7 • Kubernetes Ingress',
                    icon: 'Network',
                    badge: '502 Bad Gateway',
                    summary:
                        'Traefik finds 0 healthy endpoints in K8s Endpoints slice and returns 502 Bad Gateway.',
                    mechanics: [
                        'Traefik attempts to proxy request to target Service ClusterIP.',
                        'Service endpoints slice is empty because all application pods are in CrashLoopBackOff or OOMKilled.',
                        'Traefik immediately returns 502 Bad Gateway error page to Cloudflare.',
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
            name: 'Route Missing (HTTP 404 Not Found)',
            description:
                'Demonstrates URL path matching in Traefik vs Laravel router.',
            statusCode: 404,
            tone: 'warn',
            hops: [
                baseHops.client('/nonexistent-test-path'),
                baseHops.dns('Edge Active'),
                baseHops.ingress(`Host(\`${host}\`)`),
                baseHops.service('web-service', 80),
                {
                    ...baseHops.pod(
                        'FrankenPHP Octane',
                        'Laravel Router evaluates all routes in routes/web.php and finds no match.',
                        404,
                    ),
                    badge: '404 Not Found',
                },
            ],
        },
    };
}
