export const BASE_PT = 9;

/**
 *
 * @param size
 */
export function pt(size: number) {
  return {
    toRem() {
      return `${size / BASE_PT}rem`;
    },
    toPt() {
      return `${size}pt`;
    },
  };
}
