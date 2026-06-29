import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ImageButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  src: string;
  alt: string;
  text?: string; // Optional text overlay
  textClassName?: string;
  pressedSrc?: string;
  fitByHeight?: boolean;
}

export const ImageButton = React.forwardRef<HTMLButtonElement, ImageButtonProps>(
  ({ className, src, alt, text, textClassName, pressedSrc, fitByHeight, ...props }, ref) => {
    const [pressed, setPressed] = React.useState(false);
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.05, filter: 'brightness(1.05)' }}
        whileTap={{ scale: 0.96 }}
        onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => { 
          setPressed(true); 
          if (props.onPointerDown) props.onPointerDown(e); 
        }}
        onPointerUp={(e: React.PointerEvent<HTMLButtonElement>) => { 
          setPressed(false); 
          if (props.onPointerUp) props.onPointerUp(e); 
        }}
        onPointerCancel={(e: React.PointerEvent<HTMLButtonElement>) => { 
          setPressed(false); 
          if (props.onPointerCancel) props.onPointerCancel(e); 
        }}
        className={cn(
          "relative flex items-center justify-center transition-all focus:outline-none select-none bg-transparent border-none p-0",
          className
        )}
        {...props}
      >
        {fitByHeight ? (
          <Image
            src={pressed && pressedSrc ? pressedSrc : src}
            alt={alt}
            width={232}
            height={116}
            className="h-full w-auto object-contain pointer-events-none"
            unoptimized
          />
        ) : (
          <Image
            src={pressed && pressedSrc ? pressedSrc : src}
            alt={alt}
            fill
            className="object-contain pointer-events-none"
            unoptimized
          />
        )}
        {text && (
          <span
            className={cn(
              "absolute inset-x-0 top-[10%] flex items-start justify-center font-black text-white drop-shadow-md z-10",
              textClassName
            )}
          >
            {text}
          </span>
        )}
      </motion.button>
    );
  }
);

ImageButton.displayName = 'ImageButton';
