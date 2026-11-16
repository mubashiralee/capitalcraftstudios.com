#!/bin/sh
# Publish the site: run the tests, put together the published folder, and push
# it as the `site` branch, which GitHub Pages serves.
#
#   tools/publish.sh
#
# The published branch holds one commit: the folder as built from the commit
# that is checked out here. Nothing is pushed if a test fails, if a page names a
# file that is not there, or if there are changes that have not been committed.

set -eu
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Not published: commit your changes first. The site is built from a commit." >&2
  exit 1
fi

from=$(git rev-parse --short HEAD)
remote=$(git remote get-url origin)
name=$(git config user.name)
email=$(git config user.email)

node --test tests/

work=$(mktemp -d)
trap 'rm -rf "${work:?}"' EXIT
node tools/make-site.mjs "$work/site"

cd "$work/site"
git init -q -b site
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Published from $from"
git push -q -f "$remote" site

echo "Published $from to the site branch of $remote"
