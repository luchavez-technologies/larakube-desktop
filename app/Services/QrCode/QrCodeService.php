<?php

namespace App\Services\QrCode;

use chillerlan\QRCode\Common\EccLevel;
use chillerlan\QRCode\Output\QROutputInterface;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

class QrCodeService
{
    /**
     * Check if the runtime environment supports image manipulation.
     */
    public function isSupported(): bool
    {
        return extension_loaded('gd') || extension_loaded('imagick');
    }

    /**
     * Render raw PNG bytes for a given string or URL using GD.
     */
    public function renderPng(string $text, int $scale = 8, int $margin = 2): string
    {
        $options = new QROptions([
            'outputType' => QROutputInterface::GDIMAGE_PNG,
            'eccLevel' => EccLevel::M,
            'scale' => max(2, min(20, $scale)),
            'quietzoneSize' => max(1, min(10, $margin)),
            'imageBase64' => false,
        ]);

        return (new QRCode($options))->render($text);
    }

    /**
     * Render vector SVG string for a given string or URL.
     */
    public function renderSvg(string $text, int $scale = 6, int $margin = 2): string
    {
        $options = new QROptions([
            'outputType' => QROutputInterface::MARKUP_SVG,
            'eccLevel' => EccLevel::M,
            'scale' => max(2, min(20, $scale)),
            'quietzoneSize' => max(1, min(10, $margin)),
            'imageBase64' => false,
        ]);

        return (new QRCode($options))->render($text);
    }
}
