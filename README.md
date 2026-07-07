# Map Generator

Give it an image (ideally with the background removed), get back the texture
maps you need to make light react to it properly in Blender:

| File | What it is | Plug into |
|---|---|---|
| `*_basecolor.png` | untouched copy of your input | Base Color |
| `*_normal.png` | surface bumps as a normal map (OpenGL/Blender style) | Normal (via Normal Map node) |
| `*_ao.png` | ambient occlusion — soft shadows in crevices | multiplied into Base Color |
| `*_roughness.png` | how shiny vs. matte each area is | Roughness |
| `*_height.png` | 16-bit displacement map | Displacement (via Displacement node) |

If your input has transparency, the alpha channel is carried over to the
output maps so masking in Blender just works.

## Setup (one time)

```
pip install -r requirements.txt
```

## Run it — the easy way

**Double-click `MapGenerator.bat`.** It opens the app in your browser:
drag an image in and each map appears as a card with its own controls —
Base Color has a saturation slider, Normal has strength + invert green
(DirectX) + world space (Y-up), AO has darkness, Roughness has amount +
invert, Height has smoothing + invert. Any change re-generates
automatically. Hit **Save all (ZIP)** or save individual maps.
Everything runs locally on your machine; nothing is uploaded anywhere.
Close the black console window when you're done.

## Run it — command line (optional)

```
python generate_maps.py your_image.png
```

That creates a folder `your_image_maps/` next to the image with all the maps
inside. You can also point it at a whole folder of images:

```
python generate_maps.py my_textures_folder/
```

### Tweaking the output

| Flag | Effect |
|---|---|
| `--strength 4` | stronger bumps in the normal map (default 2.5) |
| `--ao-strength 1.5` | darker occlusion shadows (default 1.0) |
| `--smooth 2` | blur the height map more — use if the normal map looks noisy/grainy |
| `--saturation 1.3` | base color saturation, 0 = grayscale (default 1.0) |
| `--roughness-amount 0.7` | scale the roughness map, lower = shinier (default 1.0) |
| `--invert-height` | use when dark parts of your image should stick OUT (default: bright = high) |
| `--invert-roughness` | flip shiny/matte if it looks backwards |
| `--flip-y` | invert the green channel (DirectX-style normals) — leave OFF for Blender |
| `--world-space` | Y-up world-space normal map instead of tangent space |

Example:

```
python generate_maps.py rock.png --strength 4 --ao-strength 1.3 --smooth 2
```

## Hooking it up in Blender

1. Select your object, open the **Shading** tab, make sure it has a material
   with a **Principled BSDF**.
2. Drag all the generated PNGs into the node editor. Then wire them up:
   - **basecolor** → `Base Color`
     (for AO: add a **MixRGB** node set to *Multiply*, basecolor + ao in,
     result → Base Color)
   - **roughness** → `Roughness`. Set the image node's **Color Space to
     Non-Color**.
   - **normal** → add a **Normal Map** node (`Shift+A` → Vector → Normal Map),
     wire normal image → Normal Map → BSDF `Normal`. Set the image's **Color
     Space to Non-Color**.
   - **height** → add a **Displacement** node (Vector → Displacement), wire
     height image → Displacement node `Height`, then Displacement node →
     Material Output `Displacement`. **Color Space: Non-Color.** Start with
     Scale around `0.05` and adjust.
3. For real geometry displacement (not just shading): Material Properties →
   Settings → **Displacement: Displacement and Bump**, and give the mesh
   enough subdivisions (add a Subdivision Surface modifier, or use Adaptive
   Subdivision in Cycles experimental mode).

**The one thing people always forget:** every map except basecolor must have
its image node's *Color Space* set to **Non-Color**, or lighting will look
wrong.

## How it works

There is no AI here — it's the classic image-processing approach (same idea
as tools like CrazyBump/Materialize): brightness is treated as height, normals
come from the height gradients (Sobel), AO from comparing each pixel to its
blurred surroundings at several scales, and roughness from brightness +
local detail. Works great for surface textures (rock, wood, fabric, walls);
for photos of 3D objects it's an approximation — tweak the flags.
