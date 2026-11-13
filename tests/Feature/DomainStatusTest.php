<?php

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

test('returns 422 when host query parameter is missing', function () {
    $response = $this->getJson(route('domains.status'));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['host']);
});

test('skips public probing for local development domains', function () {
    Http::fake();

    $response = $this->getJson(route('domains.status', ['host' => 'myapp.dev.test']));

    $response->assertOk()
        ->assertJson([
            'host' => 'myapp.dev.test',
            'dns' => [
                'ready' => false,
                'records' => [],
            ],
            'https' => [
                'ready' => false,
                'status' => null,
            ],
        ]);

    Http::assertNothingSent();
});

test('returns dns and https not ready when DoH returns NXDOMAIN', function () {
    Http::fake([
        'https://cloudflare-dns.com/dns-query*' => Http::response([
            'Status' => 3,
            'Answer' => [],
        ], 200),
    ]);

    $response = $this->getJson(route('domains.status', ['host' => 'n8n.example.com']));

    $response->assertOk()
        ->assertJson([
            'host' => 'n8n.example.com',
            'dns' => [
                'ready' => false,
                'records' => [],
                'detail' => 'Waiting for ExternalDNS record...',
            ],
            'https' => [
                'ready' => false,
                'status' => null,
            ],
        ]);
});

test('returns dns ready and https pending when TLS verification fails on TRAEFIK DEFAULT CERT', function () {
    Http::fake([
        'https://cloudflare-dns.com/dns-query*' => Http::response([
            'Status' => 0,
            'Answer' => [
                ['type' => 1, 'data' => '167.99.10.20'],
            ],
        ], 200),
        'https://app.example.com' => function () {
            throw new ConnectionException('cURL error 60: SSL certificate problem: self-signed certificate');
        },
    ]);

    $response = $this->getJson(route('domains.status', ['host' => 'app.example.com']));

    $response->assertOk()
        ->assertJson([
            'host' => 'app.example.com',
            'dns' => [
                'ready' => true,
                'records' => ['167.99.10.20'],
                'detail' => 'Resolved: 167.99.10.20',
            ],
            'https' => [
                'ready' => false,
                'status' => null,
                'detail' => "Waiting for Traefik Let's Encrypt certificate...",
            ],
        ]);
});

test('returns dns ready and https pending when Cloudflare returns 525 or 526 origin SSL error', function () {
    Http::fake([
        'https://cloudflare-dns.com/dns-query*' => Http::response([
            'Status' => 0,
            'Answer' => [
                ['type' => 1, 'data' => '104.21.10.20'],
            ],
        ], 200),
        'https://cf.example.com' => Http::response('Invalid SSL certificate', 526),
    ]);

    $response = $this->getJson(route('domains.status', ['host' => 'cf.example.com']));

    $response->assertOk()
        ->assertJson([
            'host' => 'cf.example.com',
            'dns' => [
                'ready' => true,
                'records' => ['104.21.10.20'],
            ],
            'https' => [
                'ready' => false,
                'status' => 526,
                'detail' => "Cloudflare 526: waiting for Traefik Let's Encrypt certificate...",
            ],
        ]);
});

test('returns both dns and https ready when DoH resolves and HTTPS responds with valid TLS', function () {
    Http::fake([
        'https://cloudflare-dns.com/dns-query*' => Http::response([
            'Status' => 0,
            'Answer' => [
                ['type' => 5, 'data' => 'ingress.example.com.'],
                ['type' => 1, 'data' => '167.99.10.20'],
            ],
        ], 200),
        'https://portal.example.com' => Http::response('OK', 302),
    ]);

    $response = $this->getJson(route('domains.status', ['host' => 'https://PORTAL.EXAMPLE.COM/login']));

    $response->assertOk()
        ->assertJson([
            'host' => 'portal.example.com',
            'dns' => [
                'ready' => true,
                'records' => ['ingress.example.com', '167.99.10.20'],
            ],
            'https' => [
                'ready' => true,
                'status' => 302,
                'detail' => 'Valid HTTPS certificate (HTTP 302)',
            ],
        ]);
});
