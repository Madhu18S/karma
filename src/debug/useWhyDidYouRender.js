import { useEffect, useRef } from 'react';

export function useWhyDidYouRender(componentName, props) {
  const prevProps = useRef({});

  useEffect(() => {
    const changed = {};
    Object.keys(props).forEach(key => {
      if (prevProps.current[key] !== props[key]) {
        changed[key] = { from: prevProps.current[key], to: props[key] };
      }
    });

    if (Object.keys(changed).length > 0) {
      console.log(`🔍 ${componentName} re-rendered because:`, changed);
    }

    prevProps.current = props;
  });
}