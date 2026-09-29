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

**The full list, with beats, frame counts, start and end poses and what triggers each clip, is in [`buddy-performance-brief.md`](buddy-performance-brief.md).** That's about 45 clips across the loader, the four floors and the ribbon, in build order. **Set A** (`boot_power_on`, `type_loop`, `stand_up`, `walk_hold`) is enough to make the hero on the preview real.

The rules that apply to every clip:
- Bake to the skeleton at 30 fps. No live IK or constraints.
- **All walks in place.** Note the stride (meters per cycle) next to each one; we move him in code so his feet never slide.
- Every clip starts and ends on one of the named poses in the brief's Pose Library, so any order of events blends cleanly.
- Clip names exactly as written. The code looks them up by name.

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
