import { useEffect } from 'react';
import { getScribeCSS } from '@glyphmark/core';

export function useScribeCSS() {
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-glyphmark', '');
    style.textContent = getScribeCSS();
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}
