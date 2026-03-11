import { useRef } from 'react';

export function useRenderCount(componentName) {
  const count = useRef(0);
  count.current++;

  if (count.current > 10) {
    console.error(`🚨 ${componentName} has rendered ${count.current} times — probably a problem`);
  } else {
    console.log(`📦 ${componentName} rendered ${count.current} time(s)`);
  }
}