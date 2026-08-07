# Publishing Checklist

- [ ] Choose and add the intended open-source or proprietary `LICENSE` before announcing the repository.
- [ ] Replace placeholder repository descriptions and links in GitHub settings.
- [ ] Enable branch protection for `main` and require both CI jobs.
- [ ] Enable private vulnerability reporting and Dependabot alerts.
- [ ] Generate and commit `package-lock.json` with `npm install` in a networked environment.
- [ ] Run `npm run check` from a clean clone.
- [ ] Verify that no production catalogs, credentials, `.env` files, or local caches are tracked.
- [ ] Add screenshots or a short demo recording to the README.
- [ ] Tag the first release only after selecting the versioning and license policy.
