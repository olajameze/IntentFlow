"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type LazyIframeProps = {
  src: string;
  title: string;
  className?: string;
  referrerPolicy?: React.IframeHTMLAttributes<HTMLIFrameElement>["referrerPolicy"];
};

/** Defers iframe `src` until near viewport (works on Safari; avoids iframe `loading="lazy"`). */
export function LazyIframe({ src, title, className, referrerPolicy }: LazyIframeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [activeSrc, setActiveSrc] = useState<string | null>(null);

  useEffect(() => {
    setActiveSrc(null);
    const node = hostRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setActiveSrc(src);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActiveSrc(src);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [src]);

  return (
    <div ref={hostRef} className={cn("min-h-[inherit]", className)}>
      {activeSrc ?
        <iframe
          src={activeSrc}
          title={title}
          className="h-full min-h-[inherit] w-full border-0 bg-background"
          referrerPolicy={referrerPolicy}
        />
      : <div
          className="flex h-full min-h-[inherit] w-full items-center justify-center bg-muted/20 text-sm text-muted-foreground"
          aria-hidden
        >
          Loading analytics…
        </div>
      }
    </div>
  );
}
