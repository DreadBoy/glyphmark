import { pt } from './size-helper';

export function tighterMargin(tighterMargin: number) {
  return {
    withNormalMargin(normalMargin: number) {
      const t = pt(tighterMargin).toRem();
      const n = pt(normalMargin).toRem();
      return {
        margin: `0`,
        marginTop: `calc(var(--tighter-margin, 0) * ${t} + (1 - var(--tighter-margin, 0)) * ${n})`,
      };
    },
  };
}
tighterMargin.marker = {
  '& + *': {
    '--tighter-margin': 1,
  },
};
