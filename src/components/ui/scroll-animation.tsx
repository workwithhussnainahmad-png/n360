import React from "react";

type ContentProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  delayChildren?: number;
  staggerChildren?: number;
};

// Kept as layout wrappers so the landing page retains its composition without
// shipping Framer Motion, observers, or delayed entrance animations.
export function FadeIn({ children, className = "" }: ContentProps) {
  return <div className={className}>{children}</div>;
}

export function HeroFadeIn({ children, className = "", delay = 0 }: ContentProps) {
  return (
    <div className={`landing-reveal ${className}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

export function StaggerContainer({ children, className = "" }: ContentProps) {
  return <div className={className}>{children}</div>;
}

export function StaggerItem({ children, className = "" }: ContentProps) {
  return <div className={className}>{children}</div>;
}

export function ScaleIn({ children, className = "" }: ContentProps) {
  return <div className={className}>{children}</div>;
}
