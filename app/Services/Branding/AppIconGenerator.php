<?php

namespace App\Services\Branding;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Image;

class AppIconGenerator
{
    /**
     * Check if the runtime PHP environment has GD or Imagick installed.
     */
    public function isSupported(): bool
    {
        return extension_loaded('gd') || extension_loaded('imagick');
    }

    /**
     * Generate all platform icons from a source image file.
     *
     * @return array<string, string> Map of icon type to absolute destination path
     */
    public function generateAll(string $sourcePath, ?string $outputDir = null): array
    {
        if (! $this->isSupported()) {
            return [];
        }

        $dir = $outputDir ?? public_path();
        File::ensureDirectoryExists($dir);

        $iconPngPath = $dir.'/icon.png';
        $logoPngPath = $dir.'/logo.png';
        $template16Path = $dir.'/IconTemplate.png';
        $template32Path = $dir.'/IconTemplate@2x.png';
        $iconIcoPath = $dir.'/icon.ico';
        $iconIcnsPath = $dir.'/icon.icns';

        // 1. Generate 1024x1024 App Icon (public/icon.png)
        $this->generateAppIcon($sourcePath, $iconPngPath);

        // 2. Generate In-App Logo (public/logo.png)
        $this->generateLogo($sourcePath, $logoPngPath);

        // 3. Generate macOS MenuBar Template Icons (16x16 & 32x32)
        $this->generateTemplateIcons($sourcePath, $template16Path, $template32Path);

        // 4. Generate Windows Multi-Resolution ICO (public/icon.ico)
        $this->generateIco($iconPngPath, $iconIcoPath);

        // 5. Generate macOS ICNS Bundle (public/icon.icns)
        $this->generateIcns($iconPngPath, $iconIcnsPath);

        return [
            'icon' => $iconPngPath,
            'logo' => $logoPngPath,
            'template' => $template16Path,
            'template_2x' => $template32Path,
            'ico' => $iconIcoPath,
            'icns' => $iconIcnsPath,
        ];
    }

    /**
     * Generate the 1024x1024 primary application icon.
     */
    public function generateAppIcon(string $sourcePath, string $targetPath): bool
    {
        $image = Image::fromPath($sourcePath);

        // Proportionally fit within 1024x1024 while preserving alpha transparency
        $bytes = $image->contain(1024, 1024)
            ->toPng()
            ->toBytes();

        return (bool) file_put_contents($targetPath, $bytes);
    }

    /**
     * Generate the in-app logo for headers and sidebar (512x512).
     */
    public function generateLogo(string $sourcePath, string $targetPath): bool
    {
        $image = Image::fromPath($sourcePath);

        $bytes = $image->contain(512, 512)
            ->toPng()
            ->toBytes();

        return (bool) file_put_contents($targetPath, $bytes);
    }

    /**
     * Generate macOS MenuBar Template Icons (16x16 & 32x32 @2x).
     *
     * macOS template icons use only the alpha channel:
     * - Background must be 100% transparent.
     * - The icon glyph must be rendered with proper alpha contrast so it adapts to light & dark mode.
     *
     * @return array{16: string, 32: string}
     */
    public function generateTemplateIcons(string $sourcePath, string $target16Path, string $target32Path): array
    {
        $raw = file_get_contents($sourcePath);
        if ($raw === false) {
            throw new \RuntimeException("Unable to read source icon: {$sourcePath}");
        }

        $im = @imagecreatefromstring($raw);
        if (! $im) {
            throw new \RuntimeException("Unable to parse source image for template icon: {$sourcePath}");
        }

        imagealphablending($im, false);
        imagesavealpha($im, true);

        $w = imagesx($im);
        $h = imagesy($im);

        // Check corner pixel (0,0) to determine if source has transparent background
        $pixelAtCorner = imagecolorat($im, 0, 0);
        $cornerRgba = is_int($pixelAtCorner) ? $pixelAtCorner : 0;
        $cornerAlpha = ($cornerRgba >> 24) & 0x7F;
        $isTransparentSource = $cornerAlpha > 64;

        if ($isTransparentSource) {
            $extracted = $this->extractTransparentForeground($im, $w, $h);
        } else {
            $extracted = $this->extractSolidForeground($im, $w, $h, $cornerRgba);
        }

        // Render 16x16 (IconTemplate.png) with 14x14 max inner content
        $template16 = $this->renderTemplateCanvas($extracted, 16, 14);
        imagepng($template16, $target16Path);
        imagedestroy($template16);

        // Render 32x32 (IconTemplate@2x.png) with 26x26 max inner content
        $template32 = $this->renderTemplateCanvas($extracted, 32, 26);
        imagepng($template32, $target32Path);
        imagedestroy($template32);

        imagedestroy($extracted);
        imagedestroy($im);

        return [
            '16' => $target16Path,
            '32' => $target32Path,
        ];
    }

    /**
     * Generate a multi-resolution Windows ICO file (16, 32, 48, 64, 128, 256).
     */
    public function generateIco(string $icon1024Path, string $targetIcoPath): bool
    {
        $sizes = [16, 32, 48, 64, 128, 256];
        $images = [];

        foreach ($sizes as $size) {
            $png = Image::fromPath($icon1024Path)
                ->contain($size, $size)
                ->toPng()
                ->toBytes();

            $images[] = [
                'width' => $size,
                'height' => $size,
                'data' => $png,
                'size' => strlen($png),
            ];
        }

        $count = count($images);
        $header = pack('vvv', 0, 1, $count);
        $offset = 6 + ($count * 16);
        $entries = '';
        $dataStream = '';

        foreach ($images as $img) {
            $w = $img['width'] === 256 ? 0 : $img['width'];
            $h = $img['height'] === 256 ? 0 : $img['height'];
            $entries .= pack('CCCCvvVV', $w, $h, 0, 0, 1, 32, $img['size'], $offset);
            $dataStream .= $img['data'];
            $offset += $img['size'];
        }

        return (bool) file_put_contents($targetIcoPath, $header.$entries.$dataStream);
    }

    /**
     * Generate macOS multi-resolution ICNS bundle using macOS native iconutil.
     */
    public function generateIcns(string $icon1024Path, string $targetIcnsPath): bool
    {
        if (PHP_OS_FAMILY !== 'Darwin') {
            return false;
        }

        $iconutil = trim((string) @shell_exec('which iconutil'));
        if (empty($iconutil)) {
            return false;
        }

        $tempDir = storage_path('app/temp/iconset_'.uniqid());
        $iconsetDir = $tempDir.'/icon.iconset';
        File::makeDirectory($iconsetDir, 0755, true);

        $specs = [
            ['name' => 'icon_16x16.png', 'size' => 16],
            ['name' => 'icon_16x16@2x.png', 'size' => 32],
            ['name' => 'icon_32x32.png', 'size' => 32],
            ['name' => 'icon_32x32@2x.png', 'size' => 64],
            ['name' => 'icon_128x128.png', 'size' => 128],
            ['name' => 'icon_128x128@2x.png', 'size' => 256],
            ['name' => 'icon_256x256.png', 'size' => 256],
            ['name' => 'icon_256x256@2x.png', 'size' => 512],
            ['name' => 'icon_512x512.png', 'size' => 512],
            ['name' => 'icon_512x512@2x.png', 'size' => 1024],
        ];

        foreach ($specs as $spec) {
            $bytes = Image::fromPath($icon1024Path)
                ->contain($spec['size'], $spec['size'])
                ->toPng()
                ->toBytes();
            file_put_contents($iconsetDir.'/'.$spec['name'], $bytes);
        }

        $cmd = sprintf('iconutil -c icns %s -o %s', escapeshellarg($iconsetDir), escapeshellarg($targetIcnsPath));
        @exec($cmd, $output, $resultCode);

        File::deleteDirectory($tempDir);

        return $resultCode === 0 && file_exists($targetIcnsPath);
    }

    /**
     * Extract foreground from an image with transparent background.
     */
    protected function extractTransparentForeground(\GdImage $im, int $w, int $h): \GdImage
    {
        $minX = $w;
        $maxX = 0;
        $minY = $h;
        $maxY = 0;

        for ($x = 0; $x < $w; $x += max(1, (int) ($w / 200))) {
            for ($y = 0; $y < $h; $y += max(1, (int) ($h / 200))) {
                $rgba = imagecolorat($im, $x, $y);
                $a = ($rgba >> 24) & 0x7F;
                if ($a < 110) {
                    if ($x < $minX) {
                        $minX = $x;
                    }
                    if ($x > $maxX) {
                        $maxX = $x;
                    }
                    if ($y < $minY) {
                        $minY = $y;
                    }
                    if ($y > $maxY) {
                        $maxY = $y;
                    }
                }
            }
        }

        if ($minX >= $maxX || $minY >= $maxY) {
            $minX = 0;
            $maxX = $w - 1;
            $minY = 0;
            $maxY = $h - 1;
        }

        $bw = max(1, $maxX - $minX + 1);
        $bh = max(1, $maxY - $minY + 1);

        $extracted = imagecreatetruecolor($bw, $bh);
        imagealphablending($extracted, false);
        imagesavealpha($extracted, true);
        $trans = imagecolorallocatealpha($extracted, 0, 0, 0, 127);
        if (is_int($trans)) {
            imagefilledrectangle($extracted, 0, 0, $bw, $bh, $trans);
        }

        imagecopy($extracted, $im, 0, 0, $minX, $minY, $bw, $bh);

        return $extracted;
    }

    /**
     * Extract central foreground glyph from an image with a solid background.
     */
    protected function extractSolidForeground(\GdImage $im, int $w, int $h, int $bgRgba): \GdImage
    {
        $bgR = ($bgRgba >> 16) & 0xFF;
        $bgG = ($bgRgba >> 8) & 0xFF;
        $bgB = $bgRgba & 0xFF;

        // Downsample to a manageable working canvas (up to 512x512) for fast foreground detection
        $thumbW = max(1, min(512, $w));
        $thumbH = max(1, min(512, $h));

        $thumb = imagecreatetruecolor($thumbW, $thumbH);
        imagealphablending($thumb, false);
        imagesavealpha($thumb, true);
        imagecopyresampled($thumb, $im, 0, 0, 0, 0, $thumbW, $thumbH, $w, $h);

        $minX = $thumbW;
        $maxX = 0;
        $minY = $thumbH;
        $maxY = 0;

        for ($x = 0; $x < $thumbW; $x++) {
            for ($y = 0; $y < $thumbH; $y++) {
                $rgba = imagecolorat($thumb, $x, $y);
                if (! is_int($rgba)) {
                    continue;
                }
                $r = ($rgba >> 16) & 0xFF;
                $g = ($rgba >> 8) & 0xFF;
                $b = $rgba & 0xFF;
                $dist = sqrt(pow($r - $bgR, 2) + pow($g - $bgG, 2) + pow($b - $bgB, 2));

                if ($dist > 45) {
                    if ($x < $minX) {
                        $minX = $x;
                    }
                    if ($x > $maxX) {
                        $maxX = $x;
                    }
                    if ($y < $minY) {
                        $minY = $y;
                    }
                    if ($y > $maxY) {
                        $maxY = $y;
                    }
                }
            }
        }

        if ($minX >= $maxX || $minY >= $maxY) {
            $minX = (int) ($thumbW * 0.1);
            $maxX = (int) ($thumbW * 0.9);
            $minY = (int) ($thumbH * 0.1);
            $maxY = (int) ($thumbH * 0.9);
        }

        $bw = max(1, $maxX - $minX + 1);
        $bh = max(1, $maxY - $minY + 1);

        $extracted = imagecreatetruecolor($bw, $bh);
        imagealphablending($extracted, false);
        imagesavealpha($extracted, true);
        $trans = imagecolorallocatealpha($extracted, 0, 0, 0, 127);
        if (is_int($trans)) {
            imagefilledrectangle($extracted, 0, 0, $bw, $bh, $trans);
        }

        for ($x = 0; $x < $bw; $x++) {
            for ($y = 0; $y < $bh; $y++) {
                $rgba = imagecolorat($thumb, $minX + $x, $minY + $y);
                if (! is_int($rgba)) {
                    continue;
                }
                $r = ($rgba >> 16) & 0xFF;
                $g = ($rgba >> 8) & 0xFF;
                $b = $rgba & 0xFF;
                $dist = sqrt(pow($r - $bgR, 2) + pow($g - $bgG, 2) + pow($b - $bgB, 2));

                if ($dist > 40) {
                    imagesetpixel($extracted, $x, $y, $rgba);
                }
            }
        }

        imagedestroy($thumb);

        return $extracted;
    }

    /**
     * Render a clean monochrome template icon centered on a transparent canvas.
     */
    protected function renderTemplateCanvas(\GdImage $extracted, int $canvasSize, int $innerMaxSize): \GdImage
    {
        $bw = imagesx($extracted);
        $bh = imagesy($extracted);

        $scale = min($innerMaxSize / max(1, $bw), $innerMaxSize / max(1, $bh));
        $targetW = max(1, (int) round($bw * $scale));
        $targetH = max(1, (int) round($bh * $scale));
        $offX = (int) round(($canvasSize - $targetW) / 2);
        $offY = (int) round(($canvasSize - $targetH) / 2);

        $cSize = max(1, $canvasSize);
        $scaled = imagecreatetruecolor($cSize, $cSize);
        imagealphablending($scaled, false);
        imagesavealpha($scaled, true);
        $trans = imagecolorallocatealpha($scaled, 0, 0, 0, 127);
        if (is_int($trans)) {
            imagefilledrectangle($scaled, 0, 0, $cSize, $cSize, $trans);
        }

        imagecopyresampled($scaled, $extracted, $offX, $offY, 0, 0, $targetW, $targetH, $bw, $bh);

        // Convert scaled image into a crisp monochrome alpha template
        $template = imagecreatetruecolor($cSize, $cSize);
        imagealphablending($template, false);
        imagesavealpha($template, true);
        if (is_int($trans)) {
            imagefilledrectangle($template, 0, 0, $cSize, $cSize, $trans);
        }

        for ($x = 0; $x < $cSize; $x++) {
            for ($y = 0; $y < $cSize; $y++) {
                $rgba = imagecolorat($scaled, $x, $y);
                if (! is_int($rgba)) {
                    continue;
                }
                $a = ($rgba >> 24) & 0x7F;

                if ($a < 110) {
                    $r = ($rgba >> 16) & 0xFF;
                    $g = ($rgba >> 8) & 0xFF;
                    $b = $rgba & 0xFF;
                    $brightness = ($r * 299 + $g * 587 + $b * 114) / 1000;

                    // If pixel is a dark outline / etched line (< 65 brightness), keep it transparent
                    // If pixel is an illuminated facet or shape, render it white with alpha
                    if ($brightness >= 65) {
                        $white = imagecolorallocatealpha($template, 255, 255, 255, $a);
                        if (is_int($white)) {
                            imagesetpixel($template, $x, $y, $white);
                        }
                    }
                }
            }
        }

        imagedestroy($scaled);

        return $template;
    }
}
