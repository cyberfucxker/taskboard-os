/** TaskBoard 3 motion tokens (Lane H). Linear-strict: everything feels instant,
 * ease-out only, no springs, no bounce, no overshoot. Durations are seconds
 * (motion/react units). Animate transform/opacity (+ height via Collapse). */

export const duration = {
  press: 0.1,
  hover: 0.12,
  pop: 0.15,
  popExit: 0.1,
  collapse: 0.19,
  layout: 0.2,
  flash: 0.4,
} as const;

/** Linear's ease-out. Never use spring/bounce anywhere. */
export const ease = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** Transition presets. `instant` is used when prefers-reduced-motion is on. */
export const transition = {
  press: { duration: duration.press, ease: ease.out },
  hover: { duration: duration.hover, ease: ease.out },
  pop: { duration: duration.pop, ease: ease.out },
  popExit: { duration: duration.popExit, ease: ease.out },
  collapse: { duration: duration.collapse, ease: ease.out },
  layout: { duration: duration.layout, ease: ease.out },
  instant: { duration: 0 },
};

/** Popover / menu / dialog: fade + scale 0.98 -> 1 (exit 100ms). */
export const popIn = {
  hidden: { opacity: 0, scale: 0.98 },
  show: { opacity: 1, scale: 1, transition: transition.pop },
  exit: { opacity: 0, scale: 0.98, transition: transition.popExit },
};

/** Same, but with translateY(4px) -> 0 instead of scale. */
export const fadeUp4 = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: transition.pop },
  exit: { opacity: 0, y: 4, transition: transition.popExit },
};

/** Reduced-motion versions: opacity only, no movement. */
export const popInReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.popExit },
  exit: { opacity: 0, transition: transition.popExit },
};

/** Accordions, sidebar groups, list groups (180-200ms). */
export const collapseHeight = {
  closed: { height: 0, opacity: 0, transition: transition.collapse },
  open: { height: "auto", opacity: 1, transition: transition.collapse },
};

/** A row that is added/removed/moved inside a LayoutList. The layout move
 * itself is driven by the `layout` prop (200ms); this is only enter/exit.
 * Entering rows are readable at once (opacity never starts at 0). */
export const listItem = {
  initial: { opacity: 0.6 },
  animate: { opacity: 1, transition: transition.layout },
  exit: { opacity: 0, transition: transition.popExit },
};
