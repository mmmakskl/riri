'use client'
import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";

export interface GradientCardProps {
  children?: React.ReactNode;
  className?: string;
  width?: string | number;
  height?: string | number;
  // Для видео карточек
  thumbnailUrl?: string;
  username?: string;
  caption?: string;
  views?: string;
  likes?: string;
  date?: string;
  viralCoef?: number | string;
  onAdd?: () => void;
  onOpen?: () => void;
  onClick?: () => void;
}

export const GradientCard = ({
  children,
  className,
  width = "280px",
  height = "360px",
  thumbnailUrl,
  username,
  caption,
  views,
  likes,
  date,
  viralCoef,
  onAdd,
  onOpen,
  onClick,
}: GradientCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  // Handle mouse movement for 3D effect
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rotateX = -(y / rect.height) * 8;
      const rotateY = (x / rect.width) * 8;
      setRotation({ x: rotateX, y: rotateY });
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotation({ x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={cardRef}
      className={cn("relative rounded-[24px] overflow-hidden cursor-pointer", className)}
      style={{
        width,
        height,
        transformStyle: "preserve-3d",
        backgroundColor: "#0a0a0a",
        boxShadow: "0 -10px 80px 5px rgba(251, 146, 60, 0.25), 0 0 10px 0 rgba(0, 0, 0, 0.5)",
      }}
      initial={{ y: 0 }}
      animate={{
        y: isHovered ? -8 : 0,
        rotateX: rotation.x,
        rotateY: rotation.y,
        perspective: 1000,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onClick={onClick}
    >
      {/* Subtle glass reflection overlay */}
      <motion.div
        className="absolute inset-0 z-[35] pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 80%, rgba(255,255,255,0.06) 100%)",
          backdropFilter: "blur(2px)",
        }}
        animate={{
          opacity: isHovered ? 0.8 : 0.5,
          rotateX: -rotation.x * 0.2,
          rotateY: -rotation.y * 0.2,
          z: 1,
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Thumbnail background */}
      {thumbnailUrl && (
        <motion.div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${thumbnailUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          animate={{ z: -1 }}
        />
      )}

      {/* Dark gradient overlay */}
      <motion.div
        className="absolute inset-0 z-[5]"
        style={{
          background: thumbnailUrl 
            ? "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.85) 100%)"
            : "linear-gradient(180deg, #000000 0%, #0a0a0a 70%)",
        }}
        animate={{ z: -1 }}
      />

      {/* Noise texture overlay */}
      <motion.div
        className="absolute inset-0 opacity-20 mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
        animate={{ z: -0.5 }}
      />

      {/* Orange/amber glow effect */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-2/3 z-20"
        style={{
          background: `
            radial-gradient(ellipse at bottom right, rgba(251, 146, 60, 0.6) -10%, rgba(245, 158, 11, 0) 70%),
            radial-gradient(ellipse at bottom left, rgba(249, 115, 22, 0.6) -10%, rgba(234, 88, 12, 0) 70%)
          `,
          filter: "blur(40px)",
        }}
        animate={{
          opacity: isHovered ? 0.95 : 0.8,
          y: isHovered ? rotation.x * 0.5 : 0,
          z: 0
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Central orange glow */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-2/3 z-[21]"
        style={{
          background: `
            radial-gradient(circle at bottom center, rgba(251, 146, 60, 0.7) -20%, rgba(249, 115, 22, 0) 60%)
          `,
          filter: "blur(45px)",
        }}
        animate={{
          opacity: isHovered ? 0.9 : 0.75,
          y: isHovered ? `calc(10% + ${rotation.x * 0.3}px)` : "10%",
          z: 0
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Bottom border glow */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-[2px] z-25"
        style={{
          background: "linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.7) 50%, rgba(255, 255, 255, 0.05) 100%)",
        }}
        animate={{
          boxShadow: isHovered
            ? "0 0 20px 4px rgba(251, 146, 60, 0.9), 0 0 30px 6px rgba(249, 115, 22, 0.7), 0 0 40px 8px rgba(234, 88, 12, 0.5)"
            : "0 0 15px 3px rgba(251, 146, 60, 0.8), 0 0 25px 5px rgba(249, 115, 22, 0.6), 0 0 35px 7px rgba(234, 88, 12, 0.4)",
          opacity: isHovered ? 1 : 0.9,
          z: 0.5
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Left edge glow */}
      <motion.div
        className="absolute bottom-0 left-0 h-1/4 w-[1px] z-25 rounded-full"
        style={{
          background: "linear-gradient(to top, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.5) 20%, rgba(255, 255, 255, 0.3) 40%, rgba(255, 255, 255, 0.1) 60%, rgba(255, 255, 255, 0) 80%)",
        }}
        animate={{
          boxShadow: isHovered
            ? "0 0 20px 4px rgba(251, 146, 60, 0.9), 0 0 30px 6px rgba(249, 115, 22, 0.7)"
            : "0 0 15px 3px rgba(251, 146, 60, 0.8), 0 0 25px 5px rgba(249, 115, 22, 0.6)",
          opacity: isHovered ? 1 : 0.9,
          z: 0.5
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Right edge glow */}
      <motion.div
        className="absolute bottom-0 right-0 h-1/4 w-[1px] z-25 rounded-full"
        style={{
          background: "linear-gradient(to top, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.5) 20%, rgba(255, 255, 255, 0.3) 40%, rgba(255, 255, 255, 0.1) 60%, rgba(255, 255, 255, 0) 80%)",
        }}
        animate={{
          boxShadow: isHovered
            ? "0 0 20px 4px rgba(251, 146, 60, 0.9), 0 0 30px 6px rgba(249, 115, 22, 0.7)"
            : "0 0 15px 3px rgba(251, 146, 60, 0.8), 0 0 25px 5px rgba(249, 115, 22, 0.6)",
          opacity: isHovered ? 1 : 0.9,
          z: 0.5
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      {/* Card content */}
      <motion.div
        className="relative flex flex-col h-full p-5 z-40"
        animate={{ z: 2 }}
      >
        {/* Children content or video card layout */}
        {children ? (
          children
        ) : (
          <>
            {/* Top badges */}
            <div className="flex items-center justify-between mb-auto">
              {/* Viral badge */}
              {viralCoef !== undefined && (
                <motion.div
                  className={cn(
                    "px-3 py-1.5 rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-lg",
                    Number(viralCoef) > 10 ? "bg-emerald-500/90 text-white" : 
                    Number(viralCoef) > 5 ? "bg-amber-500/90 text-white" :
                    Number(viralCoef) > 0 ? "bg-white/90 text-slate-700" :
                    "bg-black/40 text-white/70"
                  )}
                  initial={{ filter: "blur(3px)", opacity: 0.7 }}
                  animate={{ filter: "blur(0px)", opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                  <span className="text-xs font-bold">{Number(viralCoef) > 0 ? viralCoef : '-'}</span>
                </motion.div>
              )}
              
              {/* Date badge */}
              {date && (
                <motion.div
                  className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-white text-xs font-semibold shadow-lg"
                  initial={{ filter: "blur(3px)", opacity: 0.7 }}
                  animate={{ filter: "blur(0px)", opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  {date}
                </motion.div>
              )}
            </div>

            {/* Bottom content */}
            <motion.div
              className="mt-auto"
              animate={{
                z: isHovered ? 5 : 2,
                rotateX: isHovered ? -rotation.x * 0.3 : 0,
                rotateY: isHovered ? -rotation.y * 0.3 : 0
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* Username */}
              {username && (
                <motion.div
                  className="flex items-center gap-2 mb-2"
                  initial={{ filter: "blur(3px)", opacity: 0.7 }}
                  animate={{ filter: "blur(0px)", opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  <span className="text-sm font-semibold text-white drop-shadow-lg">
                    @{username}
                  </span>
                  {Number(viralCoef) > 5 && (
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Caption */}
              {caption && (
                <motion.p
                  className="text-xs text-white/80 line-clamp-2 mb-3 leading-relaxed drop-shadow"
                  initial={{ filter: "blur(3px)", opacity: 0.7 }}
                  animate={{ filter: "blur(0px)", opacity: 0.85 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                >
                  {caption}
                </motion.p>
              )}

              {/* Stats and actions */}
              <div className="flex items-center justify-between">
                {/* Stats */}
                <motion.div
                  className="flex items-center gap-4 text-white/90"
                  initial={{ filter: "blur(3px)", opacity: 0.7 }}
                  animate={{ filter: "blur(0px)", opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                >
                  {views && (
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span className="text-xs font-medium">{views}</span>
                    </div>
                  )}
                  {likes && (
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      <span className="text-xs font-medium">{likes}</span>
                    </div>
                  )}
                </motion.div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {onAdd && (
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); onAdd(); }}
                      className="w-9 h-9 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-lg hover:bg-orange-500 hover:text-white transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </motion.button>
                  )}
                  {onOpen && (
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); onOpen(); }}
                      className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center shadow-lg hover:bg-white/30 transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

export default GradientCard;
