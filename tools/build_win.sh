#!/usr/bin/env bash
# Build dist/MecchaChameleon-Windows.zip (portable Electron app). Run from the project root in git-bash.
set -e
OUT="dist/MecchaChameleon"; STAGE="dist/stage"
rm -rf dist && mkdir -p "$OUT" "$STAGE/server" "$STAGE/node_modules"
cp -r node_modules/electron/dist/* "$OUT"/ && rm -f "$OUT/resources/default_app.asar"
mv "$OUT/electron.exe" "$OUT/Meccha Chameleon.exe"
cp index.html servers.html style.css *.js icon.png icon.ico CREDITS.txt "$STAGE"/
cp server/server.js server/public-worker.js "$STAGE/server/" && cp -r node_modules/ws "$STAGE/node_modules/"
node -e "const p=require('./package.json'); delete p.devDependencies; delete p.scripts; require('fs').writeFileSync('$STAGE/package.json', JSON.stringify(p,null,2))"
npx -y @electron/asar pack "$STAGE" "$OUT/resources/app.asar" && rm -rf "$STAGE"
V=$(node -p "require('./package.json').version")
./node_modules/rcedit/bin/rcedit-x64.exe "$OUT/Meccha Chameleon.exe" --set-icon icon.ico --set-version-string ProductName "Meccha Chameleon" --set-version-string FileDescription "Meccha Chameleon" --set-version-string CompanyName "Nos and Stealzers" --set-version-string OriginalFilename "Meccha Chameleon.exe" --set-file-version "$V" --set-product-version "$V"
printf '@echo off\r\nstart "" "%%~dp0Meccha Chameleon.exe" --servers\r\n' > "$OUT/Meccha Servers.cmd"
printf 'Meccha Chameleon %s\r\n\r\nPlay: run "Meccha Chameleon.exe".\r\nRun dedicated servers: run "Meccha Servers.cmd" (starts 2 servers on ports 7777 and 7778; edit them in the Server Manager).\r\nPublic servers (15 players each) need nothing: Play > Quick match.\r\nLAN friends see your servers automatically in the Servers tab.\r\n\r\n3D props and sound effects by Kenney (kenney.nl, CC0).\r\n' "$V" > "$OUT/README.txt"
# Python zipfile, not Compress-Archive: PowerShell writes backslash member names that some extractors flatten.
(cd dist && python -c "import zipfile,os
with zipfile.ZipFile('MecchaChameleon-Windows.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for r,_,fs in os.walk('MecchaChameleon'):
    for f in fs: p=os.path.join(r,f); z.write(p,p.replace(os.sep,'/'))")
ls -la dist
