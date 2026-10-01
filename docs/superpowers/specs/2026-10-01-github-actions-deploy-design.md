# GitHub Actions deploy

## Goal

Every push to `master` updates `/root/BBM` on `162.0.231.99` and finishes with `pm2 restart bbm`.

## Flow

Workflow file: `.github/workflows/deploy.yml`.

1. GitHub Actions starts on push to `master` only.
2. A second push waits until the current deploy finishes (`concurrency` group `deploy-production`, `cancel-in-progress: false`).
3. The runner connects as `root` over SSH.
4. On the server, in order:
   - `git pull origin master`
   - `npm ci`
   - `pm2 restart bbm`
5. If `git`, `npm`, or `pm2` is missing, or if `git pull` or `npm ci` fails, the SSH script exits before `pm2 restart bbm`. The GitHub job is red.
6. `.env` on the server is left untouched. It is gitignored, so pull does not replace it.

`pm2` is resolved from a non-interactive login path: standard system directories, then `~/.nvm/nvm.sh` when that file exists.

## Secrets

The root password is not stored in GitHub. The workflow reads one Actions secret, `DEPLOY_SSH_KEY`: the private half of the deploy key, with no passphrase. Host `162.0.231.99` and its ed25519 host key are pinned in the workflow.

The public half of the deploy key is appended once to `/root/.ssh/authorized_keys` on the server. The private key stays out of the repository. Local copy for the secret paste: `C:\Users\oleh.cherednyk\.ssh\bbm_deploy`.

## Done when

A push to `master` shows a green Deploy run, and on the server `pm2` reports the `bbm` process online after `pm2 restart bbm`.
