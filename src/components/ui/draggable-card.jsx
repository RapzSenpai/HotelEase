import { cn } from "@/lib/utils";
import React, { useRef, useContext, createContext, useEffect } from "react";
/* eslint-disable no-unused-vars -- motion used as JSX namespace <motion.div> */
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  useVelocity,
  useAnimationControls,
} from "framer-motion";
/* eslint-enable no-unused-vars */

const ContainerContext = createContext(null);

export const DraggableCardBody = ({ className, children, index = 0 }) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const cardRef = useRef(null);
  const controls = useAnimationControls();
  const containerRef = useContext(ContainerContext);

  const velocityX = useVelocity(mouseX);
  const velocityY = useVelocity(mouseY);

  const springConfig = { stiffness: 100, damping: 20, mass: 0.5 };

  const rotateX = useSpring(
    useTransform(mouseY, [-300, 300], [25, -25]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(mouseX, [-300, 300], [-25, 25]),
    springConfig,
  );
  const opacity = useSpring(
    useTransform(mouseX, [-300, 0, 300], [0.8, 1, 0.8]),
    springConfig,
  );
  const glareOpacity = useSpring(
    useTransform(mouseX, [-300, 0, 300], [0.2, 0, 0.2]),
    springConfig,
  );

  useEffect(() => {
    controls.set({ scale: 0, opacity: 0 });
    controls.start({
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 260,
        damping: 22,
        delay: index * 0.12,
      },
    });
  }, [controls, index]);

  const handleMouseMove = (e) => {
    const { clientX, clientY } = e;
    const { width, height, left, top } =
      cardRef.current?.getBoundingClientRect() ?? {
        width: 0,
        height: 0,
        left: 0,
        top: 0,
      };
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    mouseX.set(clientX - centerX);
    mouseY.set(clientY - centerY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      drag
      dragConstraints={containerRef}
      dragElastic={0.1}
      onDragStart={() => {
        document.body.style.cursor = "grabbing";
      }}
      onDragEnd={(_event, info) => {
        document.body.style.cursor = "default";

        controls.start({
          rotateX: 0,
          rotateY: 0,
          transition: { type: "spring", ...springConfig },
        });

        const vx = velocityX.get();
        const vy = velocityY.get();
        const magnitude = Math.sqrt(vx * vx + vy * vy);
        const bounce = Math.min(0.8, magnitude / 1000);

        animate(info.point.x, info.point.x + vx * 0.3, {
          duration: 0.8,
          ease: [0.2, 0, 0, 1],
          bounce,
          type: "spring",
          stiffness: 50,
          damping: 15,
          mass: 0.8,
        });
        animate(info.point.y, info.point.y + vy * 0.3, {
          duration: 0.8,
          ease: [0.2, 0, 0, 1],
          bounce,
          type: "spring",
          stiffness: 50,
          damping: 15,
          mass: 0.8,
        });
      }}
      style={{
        rotateX,
        rotateY,
        opacity,
        willChange: "transform",
        transformStyle: "preserve-3d",
      }}
      animate={controls}
      whileHover={{ scale: 1.02 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative cursor-grab overflow-hidden rounded-2xl bg-white shadow-lg active:cursor-grabbing",
        className,
      )}
    >
      {children}
      <motion.div
        style={{ opacity: glareOpacity }}
        className="pointer-events-none absolute inset-0 select-none rounded-2xl bg-white"
      />
    </motion.div>
  );
};

export const DraggableCardContainer = ({ className, children }) => {
  const containerRef = useRef(null);
  return (
    <ContainerContext.Provider value={containerRef}>
      <div
        ref={containerRef}
        className={cn(
          "relative flex items-center justify-center overflow-hidden",
          className,
        )}
      >
        {children}
      </div>
    </ContainerContext.Provider>
  );
};
