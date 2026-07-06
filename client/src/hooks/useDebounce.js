import { useState, useEffect } from "react";

/**
 * Debounce a rapidly-changing value by `delay` milliseconds.
 * Returns the stable value, which only updates after no changes for `delay` ms.
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
