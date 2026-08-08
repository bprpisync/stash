# Stash Plugins

Personal Stash plugin repository.

## Installation in Stash

After GitHub Pages is enabled, add this source in:

**Stash → Settings → Plugins → Available Plugins → Add Source**

```text
https://YOUR_GITHUB_USERNAME.github.io/stash-plugins/main/index.yml
```

Replace `YOUR_GITHUB_USERNAME` if you did not already update this README.

## Plugins

### PornPics Importer

Browse, review and import full-size PornPics images into Stash.

Current plugin version: **1.0.0**

## Repository layout

```text
plugins/
  stash-ppics/
    stash-ppics.yml
    ppics.py
    scraper.py
    stash.py
    downloader.py
    ui/
      script.js
      style.css
```

Every plugin gets its own directory under `plugins/`.

The plugin configuration filename is also the package ID used in the generated
Stash source index. For example:

```text
plugins/stash-ppics/stash-ppics.yml
```

becomes:

```yaml
id: stash-ppics
path: stash-ppics.zip
```

## Publishing

Push a change under `plugins/` to the `main` branch.

GitHub Actions automatically:

1. packages each plugin directory into a ZIP;
2. reads name, description and version from the plugin YAML;
3. calculates the ZIP SHA-256;
4. creates `main/index.yml`;
5. publishes the generated files with GitHub Pages.

Do not commit runtime cache or state directories.
