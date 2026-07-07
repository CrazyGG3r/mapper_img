"""
PBR texture map generator.

Takes an image (ideally with the background removed / transparent) and
generates the texture maps needed for a Blender material:

  - height / displacement map  (16-bit grayscale PNG)
  - normal map                 (OpenGL Y+, what Blender expects)
  - ambient occlusion map
  - roughness map
  - base color copy            (untouched input, for convenience)

Usage:
    python generate_maps.py image.png
    python generate_maps.py image.png --strength 3 --ao-strength 1.2
    python generate_maps.py folder_of_images/

Outputs go to a "<imagename>_maps" folder next to the input image.
"""

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SUPPORTED = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}


# ---------------------------------------------------------------- helpers

def _box_blur_axis(arr: np.ndarray, radius: int, axis: int) -> np.ndarray:
    """Box blur along one axis via cumulative sums — O(n) at any radius."""
    if radius < 1:
        return arr
    arr = np.moveaxis(arr, axis, -1)
    n = arr.shape[-1]
    padded = np.pad(arr, [(0, 0)] * (arr.ndim - 1) + [(radius, radius)], mode="edge")
    c = np.zeros(padded.shape[:-1] + (padded.shape[-1] + 1,), dtype=np.float64)
    np.cumsum(padded, axis=-1, out=c[..., 1:])
    out = (c[..., 2 * radius + 1:] - c[..., :n]) / (2 * radius + 1)
    return np.moveaxis(out.astype(np.float32), -1, axis)


def gaussian_blur(arr: np.ndarray, sigma: float) -> np.ndarray:
    """Approximate Gaussian blur: three successive box blurs (Kutskir sizes)."""
    if sigma <= 0:
        return arr
    n_boxes = 3
    w_ideal = math.sqrt((12.0 * sigma * sigma / n_boxes) + 1.0)
    wl = int(math.floor(w_ideal))
    if wl % 2 == 0:
        wl -= 1
    wu = wl + 2
    m = round((12.0 * sigma * sigma - n_boxes * wl * wl - 4 * n_boxes * wl - 3 * n_boxes)
              / (-4.0 * wl - 4.0))
    out = arr.astype(np.float32)
    for i in range(n_boxes):
        r = ((wl if i < m else wu) - 1) // 2
        out = _box_blur_axis(out, r, 0)
        out = _box_blur_axis(out, r, 1)
    return out


def normalize(arr: np.ndarray, low_pct: float = 1.0, high_pct: float = 99.0) -> np.ndarray:
    """Stretch array to [0,1] using percentiles so outliers don't crush contrast."""
    lo = np.percentile(arr, low_pct)
    hi = np.percentile(arr, high_pct)
    if hi - lo < 1e-8:
        return np.zeros_like(arr)
    return np.clip((arr - lo) / (hi - lo), 0.0, 1.0)


def fill_background(gray: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """
    Replace transparent pixels with a smeared-out copy of the visible pixels.
    Without this, the hard cut at the alpha edge shows up as a bright rim in
    the normal and AO maps.
    """
    mask = alpha > 0.5
    if mask.all():
        return gray
    filled = np.where(mask, gray, float(gray[mask].mean()) if mask.any() else 0.5)
    # a few blur-and-restore passes pull the edge colors outward smoothly
    for radius in (2, 4, 8, 16):
        blurred = gaussian_blur(filled, radius)
        filled = np.where(mask, gray, blurred)
    return filled


def gray_image(arr: np.ndarray, alpha: np.ndarray | None = None, bits16: bool = False) -> Image.Image:
    arr = np.clip(arr, 0.0, 1.0)
    if bits16:
        return Image.fromarray((arr * 65535.0 + 0.5).astype(np.uint16))
    img = Image.fromarray((arr * 255.0 + 0.5).astype(np.uint8), mode="L")
    if alpha is not None:
        img = img.convert("LA")
        img.putalpha(Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8)))
    return img


# ---------------------------------------------------------------- maps

def make_height(gray: np.ndarray, smooth: float, invert: bool) -> np.ndarray:
    height = normalize(gray)
    if invert:
        height = 1.0 - height
    if smooth > 0:
        height = gaussian_blur(height, smooth)
    return height


def make_normal(height: np.ndarray, strength: float, flip_y: bool,
                world_space: bool = False) -> np.ndarray:
    # Sobel gradients
    h = height.astype(np.float32)
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    ky = kx.T
    pad = np.pad(h, 1, mode="edge")
    gx = np.zeros_like(h)
    gy = np.zeros_like(h)
    for dy in range(3):
        for dx in range(3):
            sl = pad[dy:dy + h.shape[0], dx:dx + h.shape[1]]
            gx += kx[dy, dx] * sl
            gy += ky[dy, dx] * sl

    gx *= strength
    gy *= strength
    if not flip_y:          # OpenGL convention (Blender): +Y is up
        gy = -gy
    one = np.ones_like(h)
    length = np.sqrt(gx * gx + gy * gy + one)
    nx, ny, nz = -gx / length, gy / length, one / length
    if world_space:
        # Y-up world convention: green stores "up", flat areas read (0.5, 1, 0.5)
        normal = np.stack([nx, nz, ny], axis=-1)
    else:
        normal = np.stack([nx, ny, nz], axis=-1)
    return (normal * 0.5 + 0.5)  # pack [-1,1] -> [0,1]


def make_ao(height: np.ndarray, strength: float) -> np.ndarray:
    """
    Multi-scale AO: a pixel is occluded when its surroundings (blurred height)
    sit above it. Sum that over several radii for soft, deep crevices.
    """
    ao = np.zeros_like(height)
    radii = (2, 4, 8, 16, 32)
    weights = (0.30, 0.25, 0.20, 0.15, 0.10)
    for radius, weight in zip(radii, weights):
        occlusion = np.clip(gaussian_blur(height, radius) - height, 0.0, 1.0)
        ao += weight * occlusion
    ao = 1.0 - np.clip(ao * 4.0 * strength, 0.0, 1.0)
    return np.power(ao, 0.9)


def make_roughness(gray: np.ndarray, height: np.ndarray, invert: bool,
                   amount: float = 1.0) -> np.ndarray:
    # bright + smooth areas read as shinier; grainy/dark areas as rougher
    detail = normalize(np.abs(height - gaussian_blur(height, 4)), 0, 99.5)
    rough = np.clip(0.85 - normalize(gray) * 0.45 + detail * 0.35, 0.0, 1.0)
    if invert:
        rough = 1.0 - rough
    rough = np.clip(rough * amount, 0.0, 1.0)
    return gaussian_blur(rough, 1.5)


def adjust_saturation(rgba: np.ndarray, saturation: float) -> Image.Image:
    rgb = rgba[..., :3]
    g = (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114)[..., None]
    rgb = np.clip(g + (rgb - g) * saturation, 0.0, 1.0)
    out = np.concatenate([rgb, rgba[..., 3:]], axis=-1)
    return Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- driver

def generate_pbr_maps(src: Image.Image, *, strength: float = 2.5, ao_strength: float = 1.0,
                      smooth: float = 1.0, saturation: float = 1.0,
                      roughness_amount: float = 1.0, invert_height: bool = False,
                      invert_roughness: bool = False, flip_y: bool = False,
                      world_space: bool = False) -> dict[str, Image.Image]:
    """Generate all maps from a PIL image. Returns {map_name: PIL.Image}."""
    src = src.convert("RGBA")
    rgba = np.asarray(src, dtype=np.float32) / 255.0
    alpha = rgba[..., 3]
    has_alpha = bool((alpha < 0.999).any())

    # perceptual luminance
    gray = rgba[..., 0] * 0.299 + rgba[..., 1] * 0.587 + rgba[..., 2] * 0.114
    if has_alpha:
        gray = fill_background(gray, alpha)

    height = make_height(gray, smooth, invert_height)
    normal = make_normal(height, strength, flip_y, world_space)
    ao = make_ao(height, ao_strength)
    rough = make_roughness(gray, height, invert_roughness, roughness_amount)
    base = adjust_saturation(rgba, saturation) if saturation != 1.0 else src

    normal_img = Image.fromarray((np.clip(normal, 0, 1) * 255 + 0.5).astype(np.uint8), mode="RGB")
    if has_alpha:
        normal_img = normal_img.convert("RGBA")
        normal_img.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))

    a = alpha if has_alpha else None
    return {
        "basecolor": base,
        "normal": normal_img,
        "ao": gray_image(ao, a),
        "roughness": gray_image(rough, a),
        "height": gray_image(height, bits16=True),
    }


def process(path: Path, args: argparse.Namespace) -> Path:
    maps = generate_pbr_maps(
        Image.open(path),
        strength=args.strength, ao_strength=args.ao_strength, smooth=args.smooth,
        saturation=args.saturation, roughness_amount=args.roughness_amount,
        invert_height=args.invert_height, invert_roughness=args.invert_roughness,
        flip_y=args.flip_y, world_space=args.world_space,
    )
    out_dir = path.parent / f"{path.stem}_maps"
    out_dir.mkdir(exist_ok=True)
    for name, img in maps.items():
        img.save(out_dir / f"{path.stem}_{name}.png")
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate PBR maps (normal/AO/height/roughness) from an image.")
    parser.add_argument("inputs", nargs="+", help="image file(s) or folder(s)")
    parser.add_argument("--strength", type=float, default=2.5,
                        help="normal map intensity (default 2.5)")
    parser.add_argument("--ao-strength", type=float, default=1.0,
                        help="ambient occlusion darkness (default 1.0)")
    parser.add_argument("--smooth", type=float, default=1.0,
                        help="pre-blur radius for the height map, reduces noise (default 1.0)")
    parser.add_argument("--saturation", type=float, default=1.0,
                        help="base color saturation, 0 = grayscale (default 1.0)")
    parser.add_argument("--roughness-amount", type=float, default=1.0,
                        help="scale the roughness map, 0 = mirror shiny (default 1.0)")
    parser.add_argument("--invert-height", action="store_true",
                        help="treat dark pixels as high instead of bright pixels")
    parser.add_argument("--invert-roughness", action="store_true",
                        help="flip the roughness map")
    parser.add_argument("--flip-y", action="store_true",
                        help="invert the green channel (DirectX-style normal map). "
                             "Blender wants the default (OpenGL), so usually leave this off")
    parser.add_argument("--world-space", action="store_true",
                        help="Y-up world-space normal map instead of tangent space")
    args = parser.parse_args()

    files: list[Path] = []
    for raw in args.inputs:
        p = Path(raw)
        if p.is_dir():
            files += sorted(f for f in p.iterdir() if f.suffix.lower() in SUPPORTED)
        elif p.is_file():
            files.append(p)
        else:
            print(f"skipping (not found): {p}")

    if not files:
        sys.exit("No input images found.")

    for f in files:
        print(f"processing {f.name} ...", end=" ", flush=True)
        out = process(f, args)
        print(f"done -> {out}")


if __name__ == "__main__":
    main()
