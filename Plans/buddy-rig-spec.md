# Buddy, rigged: what the animator hands over

**For:** the animator. **From:** Northbound Studio. **Used by:** the homepage hero (`js/home/hero3d.js`).

## Which robot

Buddy is the **navy-and-graphite robot with the lilac visor**. He's in `buddy-awesome.webp` and in `brand/buddy-wave.webm` (the hero's wave), and the source render was named `Robot_typeA`.

He is **not** the teal-and-gold armored robot in `brand/buddy-tagger-*.webp`, and not the small orange vector in `brand/buddy.svg`.

## The scene he plays

1. **At rest, he types.** Seated at a desk, facing a monitor, hands on a keyboard. It loops on its own clock for as long as the visitor doesn't scroll.
2. **The visitor scrolls, and he stands.** Hands off the keys, he pushes up out of the chair, and the chair rolls back.
3. **He turns and walks.** Clear of the desk, he turns through facing the camera and walks out of frame to screen left.

Scroll position drives all of it: scroll back up and it plays backwards exactly. That's why the clips must be clean poses on a timeline, not physics or a state machine.

## File

| | |
|---|---|
| Format | **GLB** (glTF 2.0 binary). FBX is fine too; we convert it. |
| Axes and units | Y up, meters, Buddy about 1.85 m tall |
| Origin | On the floor, between his feet, in the standing rest pose |
| Facing | +Z |
| Mesh | One skinned mesh. 30k triangles or fewer; 60k ceiling. Also a 15k LOD if you have one. |
| Textures | PNG or WebP, **2048 or smaller**: baseColor, ORM (occlusion/roughness/metal), normal, emissive. |
| Emissive | The **visor** and the chest light strips. Keep them in the emissive map so we can drive their glow in code. |
| Materials | As few as possible. Don't bake lighting into baseColor. |

## Clips, named exactly

| Clip | Length | Notes |
|---|---|---|
| `type_loop` | 2–4 s | Seated typing. The first and last frames match exactly (seamless loop). Small head movements are welcome. |
| `stand_up` | 1.5–2 s | Seated typing to standing rest pose, including stepping back clear of the desk. |
| `walk_off` | one cycle, 0.9–1.2 s | **An in-place** walk cycle (no forward travel in the file). We move him in code and tie the steps to the distance, so his feet don't slide at any screen size. **Please write down his stride length:** meters per full cycle. |
| (optional) `turn` | 0.6–1 s | Standing rest pose facing the desk → facing screen left. Otherwise we rotate his root. |

Bake the animation to the skeleton at 30 fps. No IK or constraints left live in the file.

## Props (in the same file, or a second GLB)

- **Desk, chair and monitor**, scaled to him. The chair rolls back during `stand_up`: give it a node named `chair` and animate it in `stand_up`, or leave it still and we'll move it.
- The monitor's glass is **its own material named `screen`**, with UVs filling the face 0..1, so we can put live content on it (the loader folds into it).
- **Optional:** a glTF camera named `hero_cam` framing the seated shot. Otherwise we frame it.

## Checklist before you send it

- [ ] It opens in https://gltf-viewer.donmccurdy.com with all four clips listed by name.
- [ ] `type_loop` loops with no pop.
- [ ] Standing rest pose: feet flat on y = 0.
- [ ] File under 8 MB before our compression. We ship meshopt + WebP, and the hero budget is about 1.5 MB.

## What happens when it lands

It goes into `brand/3d/`, gets listed in `scripts/boot-manifest.ts` so the loader counts its bytes, and replaces `makeGrayboxBuddy()` in `js/home/buddy-rig.js` behind the same `pose({ t, sit, walk, phase })` call. Nothing else on the page changes.
