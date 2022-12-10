### codeforces-rust

This is my personal setup to clone codeforces contests and submit solutions from terminal.

```
npm install -g codeforces-rust

# usage:
cs -c 1221                 # clone contest
cs -s src/bin/1221_a.rs    # submit solution
```

Note that you may need to install `chromium` manually.
```
brew install chromium
xattr -rd com.apple.quarantine /Applications/Chromium.app
```
