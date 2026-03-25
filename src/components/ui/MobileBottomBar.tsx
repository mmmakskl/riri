"use client";

import * as React from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { cn } from "../../utils/cn";
import type { LucideIcon } from "lucide-react";

export type MobileTabId = "dashboard" | "workspace" | "profile" | "menu";

interface TabItem {
  id: MobileTabId;
  icon: LucideIcon;
  label: string;
  iconColor: string;
}

interface MobileBottomBarProps extends React.HTMLAttributes<HTMLElement> {
  items: TabItem[];
  activeId: MobileTabId | null;
  onTabClick: (id: MobileTabId) => void;
}

const tapSpring = { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.7 };
const dotSpring = { type: "spring" as const, stiffness: 600, damping: 38, mass: 0.6 };

export const MobileBottomBar = React.forwardRef<HTMLElement, MobileBottomBarProps>(
  ({ className, items, activeId, onTabClick, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        data-floating="true"
        role="tablist"
        className={cn(
          "md:hidden fixed left-0 right-0 bottom-0 z-[9998]",
          "pointer-events-none flex justify-center",
          className
        )}
        style={{
          background: "transparent",
          border: "none",
          paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 8,
        }}
        {...props}
      >
        {/* iOS 26-style frosted glass pill */}
        <div
          className="pointer-events-auto"
          style={{
            background: "rgba(248, 248, 252, 0.88)",
            backdropFilter: "blur(48px) saturate(200%)",
            WebkitBackdropFilter: "blur(48px) saturate(200%)",
            borderRadius: 36,
            border: "1px solid rgba(255,255,255,0.76)",
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,0.95) inset, 0 -1px 0 rgba(0,0,0,0.04) inset",
            padding: "5px 2px 6px",
          }}
        >
          <LayoutGroup id="mobile-tab-bar">
          <ul
            role="presentation"
            style={{ display: "flex", alignItems: "center", background: "transparent", border: "none", padding: 0, margin: 0, listStyle: "none" }}
          >
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;

              return (
                <li
                  key={item.id}
                  style={{ padding: 0, minHeight: "unset", borderRadius: 0, listStyle: "none", position: "relative" }}
                >
                  <motion.button
                    type="button"
                    aria-label={item.label}
                    aria-selected={isActive}
                    onClick={() => onTabClick(item.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 76,
                      paddingTop: 8,
                      paddingBottom: 8,
                      background: "transparent",
                      border: "none",
                      position: "relative",
                      willChange: "transform",
                      minHeight: "unset",
                      minWidth: "unset",
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                      gap: 4,
                    }}
                    whileTap={{ scale: 0.84 }}
                    transition={tapSpring}
                  >
                    {/* Active background pill */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          layoutId="tab-active-bg"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={dotSpring}
                          style={{
                            position: "absolute",
                            inset: "2px 8px",
                            borderRadius: 20,
                            background: "rgba(24,24,27,0.07)",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </AnimatePresence>

                    {/* Icon with subtle scale on active */}
                    <motion.div
                      animate={isActive ? { scale: 1.08, y: -1 } : { scale: 1, y: 0 }}
                      transition={dotSpring}
                      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon
                        style={{
                          width: 23,
                          height: 23,
                          color: isActive ? "#111113" : "#a8a8b0",
                          strokeWidth: isActive ? 2.2 : 1.6,
                          transition: "color 0.15s ease",
                          flexShrink: 0,
                        }}
                      />
                    </motion.div>

                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: isActive ? 650 : 400,
                        letterSpacing: "-0.01em",
                        color: isActive ? "#111113" : "#a8a8b0",
                        lineHeight: 1,
                        transition: "color 0.15s ease",
                        whiteSpace: "nowrap",
                        position: "relative",
                      }}
                    >
                      {item.label}
                    </span>

                    {/* iOS-style active dot under label */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0, y: -2 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0 }}
                          transition={dotSpring}
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            background: "#111113",
                            position: "absolute",
                            bottom: 2,
                          }}
                        />
                      )}
                    </AnimatePresence>
                  </motion.button>
                </li>
              );
            })}
          </ul>
          </LayoutGroup>
        </div>
      </nav>
    );
  }
);

MobileBottomBar.displayName = "MobileBottomBar";
