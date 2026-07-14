import { useEffect, useRef, useState } from 'react';

/** Tracks whether an element has ever entered the viewport (plus margin),
 * and keeps reporting true afterwards — used to lazily mount expensive
 * page renders only once they've been scrolled near, without unmounting
 * (and losing render work) once scrolled past. */
export function useInView<T extends HTMLElement>(rootMargin = '800px 0px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
