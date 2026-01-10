export const easeApple: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

export const springApple = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.9,
};

export const fadeFast = { duration: 0.14, ease: easeApple };
export const fadeMed  = { duration: 0.22, ease: easeApple };

export const viewFade = {
  initial: { opacity: 0, scale: 0.99 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] } },
  exit:    { opacity: 0, scale: 0.99, transition: { duration: 0.12, ease: [0.22, 0.61, 0.36, 1] } },
};

// Small button press micro-interaction
export const pressTap = { scale: 0.96 };
export const hoverLift = { scale: 1.02 };


