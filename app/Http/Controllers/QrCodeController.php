<?php

namespace App\Http\Controllers;

use App\Services\QrCode\QrCodeService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class QrCodeController extends Controller
{
    /**
     * Render and stream a QR code image as PNG or SVG.
     */
    public function show(Request $request, QrCodeService $qrService): Response
    {
        $validated = $request->validate([
            'url' => ['required', 'string', 'max:2048'],
            'format' => ['sometimes', 'string', 'in:png,svg'],
            'download' => ['sometimes', 'boolean'],
            'scale' => ['sometimes', 'integer', 'min:2', 'max:20'],
            'margin' => ['sometimes', 'integer', 'min:1', 'max:10'],
        ]);

        $url = (string) $validated['url'];
        $format = (string) ($validated['format'] ?? 'png');
        $download = $request->boolean('download');
        $scale = (int) ($validated['scale'] ?? 8);
        $margin = (int) ($validated['margin'] ?? 2);

        if ($format === 'svg') {
            $content = $qrService->renderSvg($url, $scale, $margin);
            $mime = 'image/svg+xml';
            $ext = 'svg';
        } else {
            $content = $qrService->renderPng($url, $scale, $margin);
            $mime = 'image/png';
            $ext = 'png';
        }

        $headers = [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=86400',
        ];

        if ($download) {
            $parsedHost = parse_url($url, PHP_URL_HOST);
            $hostSlug = is_string($parsedHost) ? preg_replace('/[^a-z0-9]+/i', '-', strtolower($parsedHost)) : 'qr-code';
            $filename = "qr-{$hostSlug}.{$ext}";
            $headers['Content-Disposition'] = "attachment; filename=\"{$filename}\"";
        }

        return response($content, 200, $headers);
    }
}
