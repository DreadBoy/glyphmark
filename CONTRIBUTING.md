# Contributing to Glyphmark

Thanks for your interest in contributing! A few things to know before you open
a pull request.

## Licensing of your contribution

Glyphmark is source-available under the [Elastic License 2.0](LICENSE). By
opening a pull request, issue, or any other form of contribution to this
repository, you agree to the following terms for your contribution:

1. **You license your contribution under the Elastic License 2.0** — the same
   license that covers the rest of the project. This is the default
   "inbound = outbound" rule from GitHub's Terms of Service, restated here for
   clarity.

2. **You additionally grant the project maintainer (Matic Kravina Leva) a
   perpetual, worldwide, non-exclusive, royalty-free, irrevocable, and
   sublicensable license** to use, reproduce, modify, distribute, publicly
   display, publicly perform, prepare derivative works of, and **relicense**
   your contribution under any terms — including commercial, proprietary, or
   hosted-service offerings — without further obligation to you.

   This means the maintainer can include your contribution in a paid, hosted
   version of Glyphmark or in versions distributed under different license
   terms. Your contribution remains available to everyone else under the
   Elastic License 2.0 as well; you are not giving up any of your own rights to
   your code.

3. **You represent that you have the right to make the contribution** — that
   it is your original work, or that you have the necessary rights to submit
   it, and that no employer, client, or other third party has any claim to it
   that would prevent the grants above. If your employer has rights to your
   work, you confirm you have permission to contribute it under these terms,
   or that your employer has waived such rights for this contribution.

If you cannot agree to these terms, please do not submit a contribution.

## How to contribute

- **Bugs and feature requests** — open an issue describing what you saw or
  what you'd like.
- **Pull requests** — fork the repository, create a branch, and open a PR
  against `main`. Please include a brief description of what your change does
  and why.
- **Tests** — for changes to `libs/core`, please run `npx nx test core`
  locally before opening a PR. The core library has a visual golden suite;
  do not update goldens to make tests pass — fix the code to match them.
- **Code style** — the repo uses Prettier and ESLint. Run `npx nx lint` to
  check.

## Questions

If anything above is unclear, open an issue and ask before contributing.
