import { useState } from "react";
import { motion } from "framer-motion";
import { nextOrder } from "./helpers";

// Per-slot look: unsymmetrical offsets + slight rotations, back cards smaller.
const SLOTS = [
  { top: 0, dx: 0, rotate: -4, scale: 1 },
  { top: 14, dx: 18, rotate: 6, scale: 0.94 },
  { top: 26, dx: -14, rotate: -3, scale: 0.88 },
  { top: 40, dx: 8, rotate: 3, scale: 0.82 },
  { top: 54, dx: -20, rotate: -6, scale: 0.76 },
];

const DRAG_PAST_X = 60;
const DRAG_FLING = 400;

export default function SwipeCardStack({ images }) {
  const [order, setOrder] = useState(images.map((_, i) => i));

  const handleDragEnd = (_event, info) => {
    if (
      Math.abs(info.offset.x) > DRAG_PAST_X ||
      Math.abs(info.velocity.x) > DRAG_FLING
    ) {
      setOrder(nextOrder);
    }
  };

  return (
    <div className="relative mx-auto h-[300px] w-44">
      {order.map((imageIndex, slot) => {
        const image = images[imageIndex];
        const { top, dx, rotate, scale } = SLOTS[slot] ?? SLOTS[SLOTS.length - 1];
        const isTop = slot === 0;
        return (
          <motion.div
            key={image.src}
            drag={isTop ? "x" : false}
            dragSnapToOrigin
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.7}
            onDragEnd={isTop ? handleDragEnd : undefined}
            animate={{ rotate, scale }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            className="absolute h-56 w-40 overflow-hidden rounded-[2rem] border border-border/10 bg-white shadow-lg"
            style={{ top, left: `calc(50% - 80px + ${dx}px)`, zIndex: 50 - slot }}
          >
            <img
              src={image.src}
              alt={image.alt}
              draggable={false}
              className="h-full w-full object-cover"
            />
          </motion.div>
        );
      })}
    </div>
  );
}
