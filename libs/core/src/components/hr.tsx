import { pt } from './size-helper';

export function Hr() {
  return (
    <hr
      css={{
        marginBlock: `${pt(1.5).toRem()} ${pt(1.5).toRem()}`,
        border: 0,
        borderTop: `${pt(0.5).toRem()} solid #000d`,
        borderBottom: `${pt(0.5).toRem()} solid #0002`,
        breakAfter: 'avoid',
      }}
    />
  );
}
