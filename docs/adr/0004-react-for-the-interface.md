# Build the interface in React, not Svelte

The interface was first written in Svelte 5 with shadcn-svelte. We moved it to React with shadcn/ui (Radix primitives) because the maintainer prefers React and Svelte had no recorded reason behind it. Nothing outside `src/renderer` changed: the main process, preload bridge, and shared types are untouched, and the end-to-end tests pass unchanged. Review state is now updated immutably instead of by mutating row objects. The cost is a rewrite of the interface and a larger renderer bundle.
