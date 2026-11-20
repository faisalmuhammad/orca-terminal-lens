# Design guidelines

The panel follows Orca's native light/dark colors and font, with approved shared spacing and radii. Process glyphs retain a small semantic palette for recognizability. Group headers use the neutral surface tint.

Use semantic tokens for colors and the shared spacing/radius scale. Shadow and border colors derive from the current surface. Preserve keyboard operation, visible focus states, entry-only animation, reduced-motion support, and list-only scrolling.

Release artwork uses the panel's semantic fallback palette. The cover embeds the actual panel with fictional projects, one uniform dark background, and a soft glow. These image treatments do not change the installed panel, which follows the host's theme.

When developing in a workspace with an approved design contract, retrieve that contract before UI edits and validate against it afterward. Resolve new findings through the workspace's review process.
